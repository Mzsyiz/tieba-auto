"""百度贴吧 Cookie 解析与账号验证。"""

from __future__ import annotations

import asyncio
import json
import os
import random
import re
from collections.abc import Callable
from dataclasses import dataclass

from aiotieba.config import ProxyConfig

_COOKIE_PATTERN = re.compile(r"(?i)(BDUSS|STOKEN)\s*=\s*([^;,\s\"'}]+)")
_MIN_BARE_BDUSS_LENGTH = 16


def _follow_interval_seconds(
    interval_min: float | None = None,
    interval_max: float | None = None,
) -> float:
    """关注/取关之间的随机间隔，默认 2-5 秒。"""
    try:
        low = (
            interval_min
            if interval_min is not None
            else float(os.getenv("TIEBA_FOLLOW_MIN_INTERVAL", "2"))
        )
        high = (
            interval_max
            if interval_max is not None
            else float(os.getenv("TIEBA_FOLLOW_MAX_INTERVAL", "5"))
        )
    except ValueError:
        low, high = 2.0, 5.0
    low = max(low, 0.0)
    high = max(high, low)
    return random.uniform(low, high)


def _sign_interval_seconds(
    interval_min: float | None = None,
    interval_max: float | None = None,
) -> float:
    """签到之间的随机间隔，未指定时使用环境变量，默认 1-3 秒。"""
    try:
        low = (
            interval_min
            if interval_min is not None
            else float(os.getenv("TIEBA_SIGN_MIN_INTERVAL", "1"))
        )
        high = (
            interval_max
            if interval_max is not None
            else float(os.getenv("TIEBA_SIGN_MAX_INTERVAL", "3"))
        )
    except ValueError:
        low, high = 1.0, 3.0
    low = max(low, 0.0)
    high = max(high, low)
    return random.uniform(low, high)


@dataclass(frozen=True)
class CookieCredentials:
    bduss: str = ""
    stoken: str = ""


@dataclass(frozen=True)
class VerifyResult:
    valid: bool
    user_id: int = 0
    username: str = ""
    nickname: str = ""
    portrait: str = ""
    status: str = "invalid"
    error: str = ""


@dataclass(frozen=True)
class FollowedForum:
    fid: int
    fname: str
    level: int = 0
    is_signed: bool = False
    hot_num: int = 0
    member_count: int = 0
    today_thread_num: int = 0
    thread_num: int = 0


@dataclass(frozen=True)
class FollowActionResult:
    fname: str
    success: bool
    error: str = ""
    resolved_fname: str = ""


@dataclass(frozen=True)
class SignResult:
    fname: str
    success: bool
    already_signed: bool = False
    forum_invalid: bool = False
    banned: bool = False
    error_code: int = 0
    message: str = ""


def _clean(value: str) -> str:
    return value.strip().strip('"').strip("'")


def parse_cookie(raw: str) -> CookieCredentials:
    """从完整 Cookie、JSON 或单个 BDUSS 中提取凭据。"""
    text = (raw or "").strip()
    if not text:
        return CookieCredentials()

    found: dict[str, str] = {}
    for name, value in _COOKIE_PATTERN.findall(text):
        found[name.upper()] = _clean(value)

    if not found:
        try:
            data = json.loads(text)
        except (TypeError, ValueError):
            data = None
        if isinstance(data, dict):
            for key, value in data.items():
                if (
                    isinstance(key, str)
                    and key.upper() in {"BDUSS", "STOKEN"}
                    and isinstance(value, str)
                ):
                    found[key.upper()] = _clean(value)

    bduss = found.get("BDUSS", "")
    stoken = found.get("STOKEN", "")
    if (
        not bduss
        and not found
        and ";" not in text
        and "\n" not in text
        and len(text) >= _MIN_BARE_BDUSS_LENGTH
    ):
        bduss = _clean(text)
    return CookieCredentials(bduss=bduss, stoken=stoken)


async def _verify_async(
    bduss: str,
    stoken: str,
    proxy: ProxyConfig | None = None,
) -> VerifyResult:
    try:
        from aiotieba import Account, Client
    except ImportError:
        return VerifyResult(valid=False, status="error", error="未安装 aiotieba，无法验证账号")

    account = Account(BDUSS=bduss, STOKEN=stoken)
    async with Client(
        account=account,
        proxy=proxy if proxy is not None else False,
    ) as client:
        user = await client.get_self_info()

    if user is None or not getattr(user, "user_id", 0):
        return VerifyResult(
            valid=False,
            status="invalid",
            error="无法获取用户信息，请检查 BDUSS 是否有效",
        )

    nickname = getattr(user, "nick_name_new", "") or getattr(user, "nick_name_old", "")
    username = getattr(user, "user_name", "") or nickname or f"用户_{user.user_id}"
    tieba_uid = int(getattr(user, "tieba_uid", 0) or 0)
    portrait = getattr(user, "portrait", "") or ""

    if getattr(user, "is_blocked", False):
        return VerifyResult(
            valid=False,
            user_id=tieba_uid or user.user_id,
            username=username,
            nickname=nickname,
            portrait=portrait,
            status="invalid",
            error="账号已被百度全吧封禁",
        )

    return VerifyResult(
        valid=True,
        user_id=tieba_uid or user.user_id,
        username=username,
        nickname=nickname,
        portrait=portrait,
        status="valid",
    )


def verify_credentials(
    bduss: str,
    stoken: str = "",
    timeout: float = 12.0,
    proxy: ProxyConfig | None = None,
) -> VerifyResult:
    """同步包装 aiotieba 验证，供 FastAPI 线程池中的同步接口调用。"""
    try:
        return asyncio.run(
            asyncio.wait_for(
                _verify_async(bduss, stoken, proxy),
                timeout=timeout,
            )
        )
    except TimeoutError:
        return VerifyResult(valid=False, status="error", error="验证超时，请检查网络或稍后重试")
    except Exception as exc:  # noqa: BLE001
        message = f"{type(exc).__name__}: {exc}"
        lowered = message.lower()
        if "bduss的长度应为" in lowered:
            message = "BDUSS 格式不正确（应为 192 个字符），请重新复制完整 Cookie"
        elif "stoken的长度应为" in lowered:
            message = "STOKEN 格式不正确，请重新复制完整 Cookie"
        elif "timeout" in lowered:
            message = "验证超时，请检查网络或稍后重试"
        elif "connection" in lowered:
            message = "网络连接失败，请检查网络"
        return VerifyResult(valid=False, status="error", error=message)


async def _fetch_followed_async(
    bduss: str,
    stoken: str,
    proxy: ProxyConfig | None = None,
) -> list[FollowedForum]:
    from aiotieba import Account, Client

    account = Account(BDUSS=bduss, STOKEN=stoken)
    by_fid: dict[int, FollowedForum] = {}
    async with Client(
        account=account,
        proxy=proxy if proxy is not None else False,
    ) as client:
        rich = None
        try:
            rich = await asyncio.wait_for(client.get_self_follow_forums(), timeout=8)
        except Exception:  # noqa: BLE001
            rich = None

        if rich is not None and not rich.err:
            for forum in rich.objs:
                fid = int(getattr(forum, "fid", 0) or 0)
                fname = str(getattr(forum, "fname", "") or "").strip()
                if fid <= 0 or not fname:
                    continue
                by_fid[fid] = FollowedForum(
                    fid=fid,
                    fname=fname,
                    level=int(getattr(forum, "level", 0) or 0),
                    is_signed=bool(getattr(forum, "is_signed", False)),
                    hot_num=int(getattr(forum, "hot_num", 0) or 0),
                    member_count=int(getattr(forum, "member_count", 0) or 0),
                    today_thread_num=int(getattr(forum, "today_thread_num", 0) or 0),
                    thread_num=int(getattr(forum, "thread_num", 0) or 0),
                )

        # 富状态接口失败或命中 200 条上限时，回退到稳定分页接口
        if rich is None or rich.err or len(by_fid) >= 200:
            user = await client.get_self_info()
            if user is None or not user.user_id:
                raise RuntimeError("无法获取用户信息，请检查凭据是否有效")
            page = 1
            while True:
                page_result = await client.get_follow_forums(user.user_id, pn=page, rn=50)
                if page_result.err:
                    raise RuntimeError(str(page_result.err))
                for forum in page_result.objs:
                    fid = int(getattr(forum, "fid", 0) or 0)
                    fname = str(getattr(forum, "fname", "") or "").strip()
                    if fid > 0 and fname and fid not in by_fid:
                        by_fid[fid] = FollowedForum(
                            fid=fid,
                            fname=fname,
                            level=int(getattr(forum, "level", 0) or 0),
                        )
                if not page_result.has_more:
                    break
                page += 1
    return list(by_fid.values())


def fetch_followed_forums(
    bduss: str,
    stoken: str = "",
    timeout: float = 30.0,
    proxy: ProxyConfig | None = None,
) -> list[FollowedForum]:
    """同步账号关注的所有贴吧。"""
    try:
        return asyncio.run(
            asyncio.wait_for(
                _fetch_followed_async(bduss, stoken, proxy),
                timeout=timeout,
            )
        )
    except TimeoutError as exc:
        raise TimeoutError("同步超时，请检查网络或稍后重试") from exc
    except Exception as exc:  # noqa: BLE001
        message = f"{type(exc).__name__}: {exc}"
        lowered = message.lower()
        if "timeout" in lowered:
            raise TimeoutError("同步超时，请检查网络或稍后重试") from exc
        raise RuntimeError(message) from exc


async def _follow_actions_async(
    bduss: str,
    stoken: str,
    targets: list[str],
    unfollow: bool,
    interval_min: float | None = None,
    interval_max: float | None = None,
    proxy: ProxyConfig | None = None,
) -> list[FollowActionResult]:
    from aiotieba import Account, Client

    account = Account(BDUSS=bduss, STOKEN=stoken)
    results: list[FollowActionResult] = []
    async with Client(
        account=account,
        proxy=proxy if proxy is not None else False,
    ) as client:
        for index, target in enumerate(targets):
            resolved_fname = ""
            try:
                response = (
                    await client.unfollow_forum(target)
                    if unfollow
                    else await client.follow_forum(target)
                )
                if response.err and not unfollow and target.endswith("吧"):
                    error_text = str(response.err)
                    if "fid is 0" in error_text.lower():
                        normalized = target[:-1].strip()
                        if normalized:
                            retry = await client.follow_forum(normalized)
                            if not retry.err:
                                response = retry
                                resolved_fname = normalized
                if response.err:
                    error_text = str(response.err)
                    if "fid is 0" in error_text.lower():
                        error_text = "未找到该贴吧，请确认吧名（通常不需要带“吧”后缀）"
                    results.append(
                        FollowActionResult(fname=target, success=False, error=error_text)
                    )
                else:
                    results.append(
                        FollowActionResult(
                            fname=target,
                            success=True,
                            resolved_fname=resolved_fname,
                        )
                    )
            except Exception as exc:  # noqa: BLE001
                results.append(
                    FollowActionResult(
                        fname=target,
                        success=False,
                        error=f"{type(exc).__name__}: {exc}",
                    )
                )
            if index < len(targets) - 1:
                await asyncio.sleep(_follow_interval_seconds(interval_min, interval_max))
    return results


def update_follow_relations(
    bduss: str,
    stoken: str,
    targets: list[str],
    *,
    unfollow: bool = False,
    timeout: float = 180.0,
    interval_min: float | None = None,
    interval_max: float | None = None,
    proxy: ProxyConfig | None = None,
) -> list[FollowActionResult]:
    """批量关注/取关贴吧，每个吧之间随机等待 2-5 秒。"""
    try:
        return asyncio.run(
            asyncio.wait_for(
                _follow_actions_async(
                    bduss,
                    stoken,
                    targets,
                    unfollow,
                    interval_min,
                    interval_max,
                    proxy,
                ),
                timeout=timeout,
            )
        )
    except TimeoutError as exc:
        raise TimeoutError("操作超时，请减少选中数量或稍后重试") from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"{type(exc).__name__}: {exc}") from exc


async def _sign_forums_async(
    bduss: str,
    stoken: str,
    targets: list[str],
    interval_min: float | None = None,
    interval_max: float | None = None,
    stop_event: asyncio.Event | None = None,
    on_result: Callable[[SignResult], None] | None = None,
    proxy: ProxyConfig | None = None,
) -> list[SignResult]:
    from aiotieba import Account, Client

    account = Account(BDUSS=bduss, STOKEN=stoken)
    results: list[SignResult] = []
    async with Client(
        account=account,
        proxy=proxy if proxy is not None else False,
    ) as client:
        for index, fname in enumerate(targets):
            if stop_event is not None and stop_event.is_set():
                break
            try:
                response = await client.sign_forum(fname)
                error = response.err
                code = int(getattr(error, "code", 0) or 0) if error else 0
                message = str(getattr(error, "msg", error) or "") if error else ""
                if code == 160002:
                    results.append(
                        SignResult(
                            fname=fname,
                            success=True,
                            already_signed=True,
                            error_code=code,
                            message="今日已签到",
                        )
                    )
                elif code == 3250004:
                    results.append(
                        SignResult(
                            fname=fname,
                            success=False,
                            forum_invalid=True,
                            banned=True,
                            error_code=code,
                            message="当前账号在该吧被封禁 (3250004)",
                        )
                    )
                elif code in (340006, 340001):
                    results.append(
                        SignResult(
                            fname=fname,
                            success=False,
                            forum_invalid=True,
                            error_code=code,
                            message=f"贴吧已失效 ({code})",
                        )
                    )
                elif code == 300004:
                    results.append(
                        SignResult(
                            fname=fname,
                            success=False,
                            error_code=code,
                            message="签到数据加载失败 (300004)",
                        )
                    )
                elif error:
                    results.append(
                        SignResult(
                            fname=fname,
                            success=False,
                            error_code=code,
                            message=message or str(error),
                        )
                    )
                else:
                    results.append(
                        SignResult(fname=fname, success=True, message="签到成功")
                    )
            except Exception as exc:  # noqa: BLE001
                code = int(getattr(exc, "code", 0) or 0)
                message = str(getattr(exc, "msg", exc) or "")
                results.append(
                    SignResult(
                        fname=fname,
                        success=False,
                        error_code=code,
                        message=message or f"{type(exc).__name__}: {exc}",
                    )
                )
            if on_result is not None:
                on_result(results[-1])
            if stop_event is not None and stop_event.is_set():
                break
            if index < len(targets) - 1:
                delay = _sign_interval_seconds(interval_min, interval_max)
                if stop_event is not None:
                    try:
                        await asyncio.wait_for(stop_event.wait(), timeout=delay)
                        break
                    except TimeoutError:
                        pass
                else:
                    await asyncio.sleep(delay)
    return results


async def sign_forums_async(
    bduss: str,
    stoken: str,
    targets: list[str],
    *,
    interval_min: float | None = None,
    interval_max: float | None = None,
    stop_event: asyncio.Event | None = None,
    on_result: Callable[[SignResult], None] | None = None,
    proxy: ProxyConfig | None = None,
) -> list[SignResult]:
    if not targets:
        return []
    return await _sign_forums_async(
        bduss,
        stoken,
        targets,
        interval_min=interval_min,
        interval_max=interval_max,
        stop_event=stop_event,
        on_result=on_result,
        proxy=proxy,
    )


def sign_forums_sync(
    bduss: str,
    stoken: str,
    targets: list[str],
    timeout: float = 180.0,
    interval_min: float | None = None,
    interval_max: float | None = None,
    proxy: ProxyConfig | None = None,
) -> list[SignResult]:
    """批量签到，每个吧之间随机等待 1-3 秒。"""
    if not targets:
        return []
    try:
        return asyncio.run(
            asyncio.wait_for(
                sign_forums_async(
                    bduss,
                    stoken,
                    targets,
                    interval_min=interval_min,
                    interval_max=interval_max,
                    proxy=proxy,
                ),
                timeout=timeout,
            )
        )
    except TimeoutError as exc:
        raise TimeoutError("签到超时，请减少选中数量或稍后重试") from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"{type(exc).__name__}: {exc}") from exc
