from __future__ import annotations

import ipaddress
import re
import time
import urllib.parse
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from aiotieba.config import ProxyConfig
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.proxy import ProxyNode
from app.services.app_settings import get_or_create_app_settings

_HOST_RE = re.compile(r"^[A-Za-z0-9._:\[\]-]+$")


@dataclass(frozen=True)
class AccountProxy:
    node: ProxyNode
    client_config: ProxyConfig
    httpx_url: str


def normalize_proxy_host(host: str) -> str:
    value = host.strip()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    if not value or not _HOST_RE.fullmatch(value):
        raise ValueError("代理主机格式不正确")
    try:
        ipaddress.ip_address(value)
    except ValueError:
        if " " in value or "/" in value or ":" in value:
            raise ValueError("代理主机格式不正确") from None
    return value


def build_proxy_url(proxy: ProxyNode, *, include_auth: bool = True) -> str:
    host = normalize_proxy_host(proxy.host)
    if ":" in host:
        host = f"[{host}]"
    auth = ""
    if include_auth and proxy.username and proxy.password:
        username = urllib.parse.quote(proxy.username, safe="")
        password = urllib.parse.quote(proxy.password, safe="")
        auth = f"{username}:{password}@"
    return f"{proxy.protocol}://{auth}{host}:{proxy.port}"


def build_proxy_config(proxy: ProxyNode) -> ProxyConfig:
    auth = None
    if proxy.username and proxy.password:
        from aiohttp import BasicAuth

        auth = BasicAuth(proxy.username, proxy.password)
    return ProxyConfig(url=build_proxy_url(proxy, include_auth=False), auth=auth)


def resolve_account_proxy(db: Session, account: Account) -> AccountProxy | None:
    settings = get_or_create_app_settings(db)
    proxy_id = account.proxy_id or settings.default_proxy_id
    if proxy_id is None:
        return None
    proxy = db.get(ProxyNode, proxy_id)
    if proxy is None or not proxy.is_active:
        return None
    return AccountProxy(
        node=proxy,
        client_config=build_proxy_config(proxy),
        httpx_url=build_proxy_url(proxy),
    )


def parse_proxy_line(raw: str) -> dict[str, str | int]:
    line = raw.strip()
    if not line:
        raise ValueError("空行")
    protocol = "http"
    username = ""
    password = ""

    if "://" in line:
        parsed = urllib.parse.urlsplit(line)
        protocol = parsed.scheme.lower()
        if protocol not in {"http", "https"}:
            raise ValueError("仅支持 HTTP/HTTPS 代理")
        if parsed.hostname is None or parsed.port is None:
            raise ValueError("缺少主机或端口")
        username = urllib.parse.unquote(parsed.username or "")
        password = urllib.parse.unquote(parsed.password or "")
        host, port = parsed.hostname, parsed.port
    else:
        auth_part, separator, endpoint = line.rpartition("@")
        if separator:
            credentials = auth_part.split(":", 1)
            username = credentials[0]
            password = credentials[1] if len(credentials) > 1 else ""
            parts = endpoint.split(":")
            if len(parts) != 2:
                raise ValueError("代理格式应为 host:port")
            host, port_text = parts
        else:
            parts = line.split(":")
            if len(parts) == 2:
                host, port_text = parts
            elif len(parts) == 4:
                host, port_text, username, password = parts
            else:
                raise ValueError("代理格式应为 host:port 或 host:port:user:pass")
        try:
            port = int(port_text)
        except ValueError as exc:
            raise ValueError("代理端口不是数字") from exc

    host = normalize_proxy_host(host)
    if not 1 <= port <= 65535:
        raise ValueError("代理端口超出范围")
    return {
        "protocol": protocol,
        "host": host,
        "port": port,
        "username": username,
        "password": password,
    }


def find_duplicate(
    db: Session,
    *,
    host: str,
    port: int,
    username: str,
) -> ProxyNode | None:
    return db.scalar(
        select(ProxyNode).where(
            ProxyNode.host == host,
            ProxyNode.port == port,
            ProxyNode.username == (username or None),
        )
    )


async def test_proxy_node(
    db: Session,
    proxy: ProxyNode,
    *,
    timeout_seconds: float = 12.0,
) -> tuple[bool, int | None, str]:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            proxy=build_proxy_url(proxy),
            timeout=httpx.Timeout(timeout_seconds),
            follow_redirects=True,
        ) as client:
            response = await client.get("https://www.baidu.com/")
        latency = int((time.perf_counter() - started) * 1000)
        if response.status_code in {401, 407}:
            message = f"代理认证失败（HTTP {response.status_code}）"
            _record_proxy_result(db, proxy, success=False, latency=latency, message=message)
            return False, latency, message
        if response.status_code >= 500:
            message = f"代理网关返回 HTTP {response.status_code}"
            _record_proxy_result(db, proxy, success=False, latency=latency, message=message)
            return False, latency, message
        _record_proxy_result(db, proxy, success=True, latency=latency)
        return True, latency, f"连接正常，延迟 {latency}ms"
    except Exception as exc:  # noqa: BLE001
        message = f"{type(exc).__name__}: {exc}"[:300]
        _record_proxy_result(db, proxy, success=False, message=message)
        return False, None, message


def _record_proxy_result(
    db: Session,
    proxy: ProxyNode,
    *,
    success: bool,
    latency: int | None = None,
    message: str = "",
) -> None:
    settings = get_or_create_app_settings(db)
    proxy.last_checked_at = datetime.now(UTC)
    proxy.latency_ms = latency
    if success:
        proxy.success_count += 1
        proxy.fail_count = 0
        proxy.last_error = None
    else:
        proxy.fail_count += 1
        proxy.last_error = message or "连接失败"
        if (
            settings.proxy_auto_disable
            and proxy.fail_count >= settings.proxy_failure_threshold
        ):
            proxy.is_active = False
    db.commit()
