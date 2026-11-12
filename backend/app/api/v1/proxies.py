from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.models.account import Account
from app.models.proxy import ProxyNode
from app.schemas.proxy import (
    ProxyBindRequest,
    ProxyBoundAccount,
    ProxyBulkImportRequest,
    ProxyBulkImportResult,
    ProxyCreate,
    ProxyListResponse,
    ProxyRead,
    ProxyStats,
    ProxyTestResult,
    ProxyUpdate,
)
from app.services.app_settings import get_or_create_app_settings
from app.services.proxy_service import (
    find_duplicate,
    normalize_proxy_host,
    parse_proxy_line,
    test_proxy_node,
)

router = APIRouter(prefix="/proxies", tags=["proxies"])


def _bound_accounts(db: Session, proxy_ids: list[int]) -> dict[int, list[ProxyBoundAccount]]:
    if not proxy_ids:
        return {}
    accounts = list(
        db.scalars(
            select(Account)
            .where(Account.proxy_id.in_(proxy_ids))
            .order_by(Account.id)
        ).all()
    )
    result: dict[int, list[ProxyBoundAccount]] = {proxy_id: [] for proxy_id in proxy_ids}
    for account in accounts:
        if account.proxy_id is None:
            continue
        result[account.proxy_id].append(
            ProxyBoundAccount(
                id=account.id,
                name=account.nickname or account.username,
            )
        )
    return result


def _read_proxy(
    proxy: ProxyNode,
    bound_accounts: list[ProxyBoundAccount],
) -> ProxyRead:
    return ProxyRead(
        id=proxy.id,
        name=proxy.name,
        display_name=proxy.display_name,
        protocol=proxy.protocol,
        host=proxy.host,
        port=proxy.port,
        has_auth=proxy.has_auth,
        is_active=proxy.is_active,
        fail_count=proxy.fail_count,
        success_count=proxy.success_count,
        latency_ms=proxy.latency_ms,
        last_checked_at=proxy.last_checked_at,
        last_error=proxy.last_error,
        bound_accounts=bound_accounts,
        created_at=proxy.created_at,
        updated_at=proxy.updated_at,
    )


def _list_response(db: Session) -> ProxyListResponse:
    proxies = list(
        db.scalars(
            select(ProxyNode).order_by(
                ProxyNode.created_at.desc(),
                ProxyNode.id.desc(),
            )
        ).all()
    )
    bound = _bound_accounts(db, [proxy.id for proxy in proxies])
    items = [_read_proxy(proxy, bound.get(proxy.id, [])) for proxy in proxies]
    return ProxyListResponse(
        items=items,
        total=len(items),
        stats=ProxyStats(
            total=len(items),
            active=sum(1 for proxy in proxies if proxy.is_active),
            online=sum(
                1
                for proxy in proxies
                if proxy.is_active
                and proxy.last_checked_at is not None
                and proxy.last_error is None
            ),
            failed=sum(1 for proxy in proxies if proxy.last_error is not None),
            bound_accounts=sum(len(accounts) for accounts in bound.values()),
        ),
    )


@router.get("", response_model=ProxyListResponse)
def list_proxies(
    db: DbSession,
    q: Annotated[str | None, Query(max_length=255)] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> ProxyListResponse:
    response = _list_response(db)
    items = response.items
    if q:
        query = q.strip().lower()
        items = [
            item
            for item in items
            if any(
                query in value
                for value in (
                    item.name.lower(),
                    item.host.lower(),
                    str(item.port),
                    item.protocol.lower(),
                    *(account.name.lower() for account in item.bound_accounts),
                )
            )
        ]
    if status_filter == "active":
        items = [item for item in items if item.is_active]
    elif status_filter == "inactive":
        items = [item for item in items if not item.is_active]
    elif status_filter == "failed":
        items = [item for item in items if item.last_error]
    return ProxyListResponse(items=items, total=len(items), stats=response.stats)


@router.post("", response_model=ProxyRead, status_code=status.HTTP_201_CREATED)
def create_proxy(payload: ProxyCreate, db: DbSession) -> ProxyRead:
    try:
        host = normalize_proxy_host(payload.host)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    username = (payload.username or "").strip()
    password = (payload.password or "").strip()
    if bool(username) != bool(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="代理用户名和密码需要同时填写",
        )
    if find_duplicate(db, host=host, port=payload.port, username=username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该代理已存在")
    proxy = ProxyNode(
        name=payload.name.strip(),
        protocol=payload.protocol,
        host=host,
        port=payload.port,
        username=username or None,
        password=password or None,
        is_active=payload.is_active,
    )
    db.add(proxy)
    db.commit()
    db.refresh(proxy)
    return _read_proxy(proxy, [])


@router.post("/bulk", response_model=ProxyBulkImportResult)
def bulk_import_proxies(
    payload: ProxyBulkImportRequest,
    db: DbSession,
) -> ProxyBulkImportResult:
    added: list[ProxyNode] = []
    errors: list[str] = []
    skipped = 0
    seen: set[tuple[str, int, str]] = set()
    for line_number, line in enumerate(payload.raw.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            parsed = parse_proxy_line(line)
            key = (
                str(parsed["host"]),
                int(parsed["port"]),
                str(parsed["username"]),
            )
            if key in seen or find_duplicate(
                db,
                host=key[0],
                port=key[1],
                username=key[2],
            ):
                skipped += 1
                continue
            seen.add(key)
            proxy = ProxyNode(
                name="",
                protocol=str(parsed["protocol"]),
                host=key[0],
                port=key[1],
                username=key[2] or None,
                password=str(parsed["password"]) or None,
                is_active=True,
            )
            if bool(key[2]) != bool(str(parsed["password"])):
                raise ValueError("用户名和密码需要同时填写")
            db.add(proxy)
            db.flush()
            added.append(proxy)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"第 {line_number} 行：{exc}")
    db.commit()
    items = [_read_proxy(proxy, []) for proxy in added]
    return ProxyBulkImportResult(
        added=len(added),
        skipped=skipped,
        errors=errors,
        items=items,
    )


@router.patch("/{proxy_id}", response_model=ProxyRead)
def update_proxy(proxy_id: int, payload: ProxyUpdate, db: DbSession) -> ProxyRead:
    proxy = db.get(ProxyNode, proxy_id)
    if proxy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="代理不存在")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("host") is not None:
        try:
            changes["host"] = normalize_proxy_host(changes["host"])
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    next_host = str(changes.get("host", proxy.host))
    next_port = int(changes.get("port", proxy.port))
    next_username = str(
        changes.get("username", proxy.username or "") or ""
    ).strip()
    duplicate = find_duplicate(
        db,
        host=next_host,
        port=next_port,
        username=next_username,
    )
    if duplicate is not None and duplicate.id != proxy.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该代理已存在")
    next_password = str(changes.get("password", proxy.password or "") or "").strip()
    if bool(next_username) != bool(next_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="代理用户名和密码需要同时填写",
        )
    for field, value in changes.items():
        if field == "name":
            value = str(value or "").strip()
        elif field in {"username", "password"}:
            value = str(value or "").strip() or None
        setattr(proxy, field, value)
    if "username" in changes or "password" in changes:
        proxy.last_checked_at = None
        proxy.last_error = None
        proxy.latency_ms = None
    db.commit()
    db.refresh(proxy)
    return _read_proxy(proxy, _bound_accounts(db, [proxy.id]).get(proxy.id, []))


@router.post("/{proxy_id}/test", response_model=ProxyTestResult)
async def test_proxy(proxy_id: int, db: DbSession) -> ProxyTestResult:
    proxy = db.get(ProxyNode, proxy_id)
    if proxy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="代理不存在")
    settings = get_or_create_app_settings(db)
    success, latency, message = await test_proxy_node(
        db,
        proxy,
        timeout_seconds=settings.request_timeout_seconds,
    )
    return ProxyTestResult(
        success=success,
        latency_ms=latency,
        message=message,
        checked_at=datetime.now(UTC),
    )


@router.put("/{proxy_id}/bind", response_model=ProxyRead)
def bind_proxy_accounts(
    proxy_id: int,
    payload: ProxyBindRequest,
    db: DbSession,
) -> ProxyRead:
    proxy = db.get(ProxyNode, proxy_id)
    if proxy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="代理不存在")
    account_ids = list(dict.fromkeys(payload.account_ids))
    accounts = list(db.scalars(select(Account).where(Account.id.in_(account_ids))).all())
    if len(accounts) != len(account_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部分账号不存在")
    currently_bound = list(
        db.scalars(select(Account).where(Account.proxy_id == proxy_id)).all()
    )
    for account in currently_bound:
        if account.id not in account_ids:
            account.proxy_id = None
    for account in accounts:
        account.proxy_id = proxy_id
    db.commit()
    return _read_proxy(proxy, _bound_accounts(db, [proxy.id]).get(proxy.id, []))


@router.delete("/{proxy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proxy(proxy_id: int, db: DbSession) -> None:
    proxy = db.get(ProxyNode, proxy_id)
    if proxy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="代理不存在")
    for account in db.scalars(select(Account).where(Account.proxy_id == proxy_id)).all():
        account.proxy_id = None
    settings = get_or_create_app_settings(db)
    if settings.default_proxy_id == proxy_id:
        settings.default_proxy_id = None
    db.delete(proxy)
    db.commit()
