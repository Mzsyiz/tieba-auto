"""贴吧 Web 发帖与图片上传。"""

from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
import random
import socket
import ssl
import urllib.parse
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypeVar, cast

import aiohttp
from aiohttp import ClientConnectionError
from aiotieba import Account, Client
from aiotieba.config import ProxyConfig, TimeoutConfig

DEFAULT_WEB_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
COMMIT_THREAD_ADD_PC_URL = "https://tieba.baidu.com/c/c/thread/add_pc"
UPLOAD_PICTURE_URL = "https://tieba.baidu.com/c/s/uploadPicture_pc"
UPLOAD_SIGN_SALT = "36770b1f34c9bbf2e7d1a99d2b82fa9e"
UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
MAX_IMAGE_BYTES = 20 * 1024 * 1024
ALLOWED_IMAGE_MIME = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}
CONNECT_ATTEMPTS = 3
HTTP_CONNECT_ATTEMPTS = 3

T = TypeVar("T")


@dataclass(frozen=True)
class PostResult:
    success: bool
    tid: int = 0
    message: str = ""
    error_code: int = 0


@dataclass(frozen=True)
class WebResponse:
    status_code: int
    content: bytes

    def json(self) -> dict[str, Any]:
        return cast(dict[str, Any], json.loads(self.content))


def _http_timeout(seconds: float) -> aiohttp.ClientTimeout:
    timeout = max(float(seconds), 1.0)
    return aiohttp.ClientTimeout(
        total=timeout,
        sock_connect=timeout,
        sock_read=timeout,
    )


def _create_http_client(
    *,
    timeout: float,
    proxy_url: str | None,
) -> aiohttp.ClientSession:
    # Baidu's web endpoint has shown TLS negotiation stalls with clients that
    # advertise HTTP/2/TLS 1.3. aiotieba already uses TLS 1.2 + IPv4 here.
    ssl_context = ssl.create_default_context()
    ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
    ssl_context.maximum_version = ssl.TLSVersion.TLSv1_2
    connector_options: dict[str, Any] = {
        "ssl": ssl_context,
        "ttl_dns_cache": 60,
    }
    if proxy_url is None or not (
        proxy_url.startswith("http://[") or proxy_url.startswith("https://[")
    ):
        connector_options["family"] = socket.AF_INET
        connector_options["local_addr"] = ("0.0.0.0", 0)
    connector = aiohttp.TCPConnector(**connector_options)
    return aiohttp.ClientSession(
        connector=connector,
        timeout=_http_timeout(timeout),
        trust_env=False,
        auto_decompress=True,
    )


def _proxy_request_options(
    proxy_url: str | None,
) -> tuple[str | None, aiohttp.BasicAuth | None]:
    if proxy_url is None:
        return None, None
    parsed = urllib.parse.urlsplit(proxy_url)
    if parsed.hostname is None:
        raise RuntimeError("代理地址格式不正确")
    host = parsed.hostname
    if ":" in host:
        host = f"[{host}]"
    netloc = f"{host}:{parsed.port}" if parsed.port is not None else host
    clean_proxy = urllib.parse.urlunsplit(
        (parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment)
    )
    if parsed.username is None:
        return clean_proxy, None
    return clean_proxy, aiohttp.BasicAuth(
        urllib.parse.unquote(parsed.username),
        urllib.parse.unquote(parsed.password or ""),
    )


def _aiotieba_timeout(seconds: float) -> TimeoutConfig:
    timeout = max(float(seconds), 3.0)
    return TimeoutConfig(
        http_acquire_conn=timeout,
        http_read=timeout,
        http_connect=timeout,
        dns_ttl=60,
    )


def _is_connection_error(exc: BaseException) -> bool:
    return isinstance(exc, (TimeoutError, ClientConnectionError, OSError))


def _network_failure_message(
    stage: str,
    exc: BaseException,
    *,
    attempts: int,
    timeout: float,
    using_proxy: bool,
) -> str:
    detail = str(exc).strip()
    if isinstance(exc, (TimeoutError, aiohttp.ServerTimeoutError)):
        reason = "连接超时"
    elif isinstance(exc, (ClientConnectionError, OSError)):
        reason = "网络连接失败"
    else:
        reason = f"{type(exc).__name__}：{detail}" if detail else type(exc).__name__

    proxy_hint = (
        "当前使用代理，请先在“代理池”测试该节点"
        if using_proxy
        else "当前为直连，请检查电脑能否访问 tieba.baidu.com"
    )
    return (
        f"{stage}：{reason}（已尝试 {attempts} 次，单次超时 {timeout:.0f} 秒）。"
        f"{proxy_hint}"
    )[:500]


async def _post_with_connect_retry(
    http_client: aiohttp.ClientSession,
    url: str,
    *,
    stage: str,
    headers: dict[str, str],
    timeout: float,
    using_proxy: bool,
    proxy_url: str | None,
    **kwargs: Any,
) -> WebResponse:
    proxy, proxy_auth = _proxy_request_options(proxy_url)
    for attempt in range(1, HTTP_CONNECT_ATTEMPTS + 1):
        try:
            async with http_client.post(
                url,
                headers=headers,
                timeout=_http_timeout(timeout),
                proxy=proxy,
                proxy_auth=proxy_auth,
                allow_redirects=False,
                **kwargs,
            ) as response:
                return WebResponse(
                    status_code=response.status,
                    content=await response.read(),
                )
        except (aiohttp.ServerTimeoutError, aiohttp.ClientConnectorError) as exc:
            if attempt >= HTTP_CONNECT_ATTEMPTS:
                raise RuntimeError(
                    _network_failure_message(
                        stage,
                        exc,
                        attempts=HTTP_CONNECT_ATTEMPTS,
                        timeout=timeout,
                        using_proxy=using_proxy,
                    )
                ) from exc
            await asyncio.sleep(1.5)
        except TimeoutError as exc:
            raise RuntimeError(
                _network_failure_message(
                    stage,
                    exc,
                    attempts=attempt,
                    timeout=timeout,
                    using_proxy=using_proxy,
                )
            ) from exc
    raise AssertionError("unreachable")


async def _call_aiotieba_with_retry(
    operation: Callable[[], Awaitable[T]],
    *,
    stage: str,
    timeout: float,
    using_proxy: bool,
) -> T:
    for attempt in range(1, CONNECT_ATTEMPTS + 1):
        try:
            result = await operation()
            error = getattr(result, "err", None)
            if error is None:
                return result
            if not isinstance(error, BaseException):
                raise RuntimeError(f"{stage}失败：{error}")
            if not _is_connection_error(error):
                raise RuntimeError(f"{stage}失败：{type(error).__name__}：{error}") from error
            last_error: BaseException = error
        except Exception as exc:
            if not _is_connection_error(exc):
                raise
            last_error = exc

        if attempt < CONNECT_ATTEMPTS:
            await asyncio.sleep(attempt)

    raise RuntimeError(
        _network_failure_message(
            stage,
            last_error,
            attempts=CONNECT_ATTEMPTS,
            timeout=timeout,
            using_proxy=using_proxy,
        )
    ) from last_error


def build_web_headers(
    bduss: str,
    stoken: str,
    quoted_fname: str,
) -> dict[str, str]:
    return {
        "Cookie": f"BDUSS={bduss}; STOKEN={stoken}",
        "User-Agent": DEFAULT_WEB_UA,
        "Referer": f"https://tieba.baidu.com/f?kw={quoted_fname}",
        "Origin": "https://tieba.baidu.com",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    }


def normalize_web_content(content: str) -> str:
    return content.replace("\r\n", "\n").replace("\r", "\n")


def build_pc_thread_fields(
    fname: str,
    fid: int,
    tbs: str,
    title: str,
    content: str,
    *,
    is_pictxt: bool,
) -> dict[str, str]:
    fields: dict[str, str] = {
        "kw": fname,
        "fid": str(fid),
        "title": title,
        "content": content,
        "is_hide": "1",
        "is_pictxt": "1" if is_pictxt else "0",
        "content_statement": "个人主页不可见",
        "ext": json.dumps(
            {
                "is_hide": "1",
                "needImage": "1" if is_pictxt else "0",
                "content_statement": "个人主页不可见",
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        "jt": "",
        "tbs": tbs,
        "subapp_type": "pc",
        "_client_type": "20",
    }
    fields["sign"] = _pc_sign(fields)
    return fields


async def _load_image(
    url: str,
    *,
    proxy_url: str | None = None,
    timeout: float = 20.0,
) -> tuple[bytes, str, str]:
    if url.startswith("/uploads/"):
        relative = url.removeprefix("/uploads/")
        path = (UPLOAD_ROOT / relative).resolve()
        if not path.is_relative_to(UPLOAD_ROOT.resolve()):
            raise RuntimeError("图片路径非法")
        if not path.is_file():
            raise RuntimeError(f"图片不存在：{path.name}")
        data = path.read_bytes()
        name = path.name
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    else:
        proxy, proxy_auth = _proxy_request_options(proxy_url)
        async with _create_http_client(
            timeout=timeout,
            proxy_url=proxy_url,
        ) as client:
            async with client.get(
                url,
                timeout=_http_timeout(timeout),
                proxy=proxy,
                proxy_auth=proxy_auth,
                allow_redirects=True,
            ) as response:
                response.raise_for_status()
                data = await response.read()
            mime = (response.headers.get("content-type") or "").split(";")[0].strip()
            name = Path(urllib.parse.urlparse(url).path).name or "image"
        if not mime:
            mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    if mime not in ALLOWED_IMAGE_MIME:
        raise RuntimeError(f"不支持的图片格式：{mime}")
    if len(data) > MAX_IMAGE_BYTES:
        raise RuntimeError("单张图片不能超过 20MB")
    return data, name, mime


def _pc_sign(fields: dict[str, str]) -> str:
    payload = "".join(f"{key}={fields[key]}" for key in sorted(fields)) + UPLOAD_SIGN_SALT
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


def _upload_sign(fields: dict[str, str]) -> str:
    signed = {**fields, "chunk": "[object File]"}
    return _pc_sign(signed)


async def _upload_image(
    client: Client,
    http_client: aiohttp.ClientSession,
    bduss: str,
    stoken: str,
    fname: str,
    data: bytes,
    name: str,
    mime: str,
    proxy_url: str | None = None,
    timeout: float = 30.0,
) -> dict[str, str]:
    tbs = getattr(client.account, "tbs", None)
    if not tbs:
        raise RuntimeError("获取图片上传凭证(TBS)失败")
    resource_id = hashlib.md5(data).hexdigest()
    fields = {
        "resourceId": resource_id,
        "isFinish": "1",
        "saveOrigin": "1",
        "size": str(len(data)),
        "width": "120",
        "height": "120",
        "chunkNo": "1",
        "pic_water_type": "3",
        "tbs": str(tbs),
        "subapp_type": "pc",
        "_client_type": "20",
    }
    fields["sign"] = _upload_sign(fields)
    headers = build_web_headers(
        bduss,
        stoken,
        urllib.parse.quote(fname),
    )
    headers.pop("Content-Type", None)
    headers["Accept"] = "application/json, text/plain, */*"
    form = aiohttp.FormData()
    for key, value in fields.items():
        form.add_field(key, value)
    form.add_field("chunk", data, filename=name, content_type=mime)
    response = await _post_with_connect_retry(
        http_client,
        UPLOAD_PICTURE_URL,
        stage="上传素材图片",
        headers=headers,
        timeout=timeout,
        using_proxy=proxy_url is not None,
        proxy_url=proxy_url,
        data=form,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"上传素材图片失败：服务器返回 HTTP {response.status_code}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"上传素材图片失败：服务器返回了无法解析的响应（HTTP {response.status_code}）"
        ) from exc
    if str(payload.get("error_code", "")) != "0":
        raise RuntimeError(payload.get("error_msg") or str(payload))
    origin = (payload.get("picInfo") or {}).get("originPic") or {}
    return {
        "pic_id": str(payload.get("picId") or ""),
        "width": str(origin.get("width") or "120"),
        "height": str(origin.get("height") or "120"),
    }


async def _prewarm_and_commit(
    http_client: aiohttp.ClientSession,
    headers: dict[str, str],
    quoted_fname: str,
    fields: dict[str, str],
    prewarm_min: float,
    prewarm_max: float,
    timeout: float,
    proxy_url: str | None,
    using_proxy: bool,
) -> dict[str, Any]:
    try:
        proxy, proxy_auth = _proxy_request_options(proxy_url)
        async with http_client.get(
            f"https://tieba.baidu.com/f?kw={quoted_fname}",
            headers=headers,
            timeout=_http_timeout(timeout),
            proxy=proxy,
            proxy_auth=proxy_auth,
            allow_redirects=True,
        ) as prewarm_response:
            await prewarm_response.read()
        await asyncio.sleep(random.uniform(prewarm_min, max(prewarm_max, prewarm_min)))
    except Exception:
        pass

    form = aiohttp.FormData()
    for key, value in fields.items():
        form.add_field(key, value)
    commit_headers = {**headers}
    commit_headers.pop("Content-Type", None)
    commit_headers["Accept"] = "*/*"
    commit_headers["Referer"] = (
        f"https://tieba.baidu.com/f?kw={quoted_fname}&fr=personalize_page"
    )
    response = await _post_with_connect_retry(
        http_client,
        COMMIT_THREAD_ADD_PC_URL,
        stage="提交帖子",
        headers=commit_headers,
        timeout=timeout,
        using_proxy=using_proxy,
        proxy_url=proxy_url,
        data=form,
    )

    if response.status_code >= 400:
        raise RuntimeError(f"提交帖子失败：服务器返回 HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"提交帖子失败：服务器返回了无法解析的响应（HTTP {response.status_code}）"
        ) from exc


async def publish_thread(
    bduss: str,
    stoken: str,
    fname: str,
    title: str,
    content: str,
    image_urls: list[str] | None = None,
    proxy: ProxyConfig | None = None,
    proxy_url: str | None = None,
    prewarm_min: float = 1.2,
    prewarm_max: float = 3.5,
    request_timeout: float = 30.0,
) -> PostResult:
    """使用贴吧 Web 表单接口发布主题帖。"""
    if not bduss:
        return PostResult(False, message="该账号未配置 BDUSS")
    if not title.strip() or not content.strip():
        return PostResult(False, message="标题和正文不能为空")

    try:
        account = Account(BDUSS=bduss, STOKEN=stoken)
        using_proxy = proxy_url is not None
        async with Client(
            account=account,
            proxy=proxy if proxy is not None else False,
            timeout=_aiotieba_timeout(request_timeout),
        ) as client:
            await _call_aiotieba_with_retry(
                client.get_self_info,
                stage="获取账号信息",
                timeout=request_timeout,
                using_proxy=using_proxy,
            )
            tbs = getattr(client.account, "tbs", None)
            if not tbs:
                return PostResult(False, message="获取账号发帖凭证(TBS)失败")
            forum = await _call_aiotieba_with_retry(
                lambda: client.get_forum(fname),
                stage="获取贴吧信息",
                timeout=request_timeout,
                using_proxy=using_proxy,
            )
            fid = int(getattr(forum, "fid", 0) or 0)
            if fid <= 0:
                return PostResult(False, message=f"无法获取贴吧 fid：{fname}")

            async with _create_http_client(
                timeout=request_timeout,
                proxy_url=proxy_url,
            ) as http_client:
                uploaded_images: list[dict[str, str]] = []
                for url in (image_urls or [])[:10]:
                    try:
                        data, name, mime = await _load_image(
                            url,
                            proxy_url=proxy_url,
                            timeout=request_timeout,
                        )
                    except Exception as exc:
                        raise RuntimeError(
                            f"读取素材图片失败：{type(exc).__name__}：{exc}"
                        ) from exc
                    try:
                        uploaded_images.append(
                            await _upload_image(
                                client,
                                http_client,
                                bduss,
                                stoken,
                                fname,
                                data,
                                name,
                                mime,
                                proxy_url,
                                request_timeout,
                            )
                        )
                    except RuntimeError:
                        raise
                    except Exception as exc:
                        raise RuntimeError(
                            f"上传素材图片失败：{type(exc).__name__}：{exc}"
                        ) from exc

                post_content = normalize_web_content(content)
                markers = "\n".join(
                    f"#(pic,{image['pic_id']},{image['width']},{image['height']})"
                    for image in uploaded_images
                    if image.get("pic_id")
                )
                if markers:
                    post_content = f"{post_content}\n{markers}"

                quoted_fname = urllib.parse.quote(fname)
                headers = build_web_headers(bduss, stoken, quoted_fname)
                fields = build_pc_thread_fields(
                    fname,
                    fid,
                    str(tbs),
                    title.strip(),
                    post_content,
                    is_pictxt=bool(uploaded_images),
                )
                payload = await _prewarm_and_commit(
                    http_client,
                    headers,
                    quoted_fname,
                    fields,
                    prewarm_min,
                    prewarm_max,
                    request_timeout,
                    proxy_url,
                    using_proxy,
                )

        raw_error_code = payload.get(
            "error_code",
            payload.get("err_code", payload.get("no", 0)),
        )
        error_code = int(raw_error_code or 0)
        if error_code == 0:
            tid = int(
                payload.get("tid")
                or (payload.get("data") or {}).get("tid")
                or 0
            )
            return PostResult(True, tid=tid, message="发帖成功")

        response_data = payload.get("data") or {}
        vcode = response_data.get("vcode") or {}
        if vcode.get("need_vcode"):
            message = "发帖需要验证码，请先手动验证账号"
        else:
            message = str(
                payload.get("error")
                or payload.get("error_msg")
                or f"发帖失败（err_code={error_code}）"
            )
        return PostResult(False, message=message, error_code=error_code)
    except Exception as exc:  # noqa: BLE001
        if isinstance(exc, RuntimeError):
            return PostResult(False, message=str(exc))
        return PostResult(False, message=f"{type(exc).__name__}: {exc}")
