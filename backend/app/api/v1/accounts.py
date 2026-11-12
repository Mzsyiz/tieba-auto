import os
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.core.tieba import parse_cookie, verify_credentials
from app.models.account import Account, AccountStatus
from app.models.proxy import ProxyNode
from app.schemas.account import AccountCreate, AccountRead, AccountUpdate, CookieImportRequest
from app.services.app_settings import get_or_create_app_settings
from app.services.forum_sync import sync_account_forums
from app.services.proxy_service import build_proxy_config, resolve_account_proxy

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _auto_sync_follows(db: Session, account: Account) -> None:
    settings = get_or_create_app_settings(db)
    if (
        not account.bduss
        or not settings.auto_sync_forums
        or os.getenv("TIEBA_DISABLE_AUTO_SYNC") == "1"
    ):
        return
    try:
        effective_proxy = resolve_account_proxy(db, account)
        sync_account_forums(
            db,
            account,
            timeout=settings.request_timeout_seconds,
            proxy=effective_proxy.client_config if effective_proxy else None,
        )
    except Exception:  # noqa: BLE001
        db.rollback()


def _validate_proxy_id(db: Session, proxy_id: int | None) -> None:
    if proxy_id is None:
        return
    if db.get(ProxyNode, proxy_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="代理不存在")


@router.get("", response_model=list[AccountRead])
def list_accounts(
    db: DbSession,
    status_filter: Annotated[AccountStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=255, description="按用户名/昵称模糊搜索")] = None,
) -> list[Account]:
    stmt = select(Account).order_by(Account.created_at.desc(), Account.id.desc())
    if status_filter is not None:
        stmt = stmt.where(Account.status == status_filter.value)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Account.username.ilike(like),
                func.coalesce(Account.nickname, "").ilike(like),
            )
        )
    return list(db.scalars(stmt).all())


@router.post("/import-cookie", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def import_cookie(payload: CookieImportRequest, db: DbSession) -> Account:
    """粘贴 Cookie 一键导入：自动解析凭据，可选调用百度接口验证。"""
    parsed = parse_cookie(payload.cookie or "")
    bduss = (payload.bduss or parsed.bduss).strip()
    stoken = (payload.stoken or parsed.stoken).strip()
    if not bduss:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未从 Cookie 中识别到 BDUSS，请检查粘贴内容",
        )
    _validate_proxy_id(db, payload.proxy_id)

    existing = db.scalar(select(Account).where(Account.bduss == bduss))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该账号已存在：{existing.username}",
        )

    verification = None
    if payload.verify:
        proxy = db.get(ProxyNode, payload.proxy_id) if payload.proxy_id else None
        verification = verify_credentials(
            bduss,
            stoken,
            proxy=build_proxy_config(proxy) if proxy else None,
        )
        if not verification.valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=verification.error or "账号验证失败",
            )

    if verification is not None:
        username = verification.username
        nickname = verification.nickname or None
        tieba_uid = verification.user_id or None
        portrait = verification.portrait or None
        account_status = AccountStatus.VALID
        status_reason = None
        last_login_at = datetime.now(UTC)
    else:
        display_name = (payload.name or "").strip()
        username = display_name or f"未验证账号_{uuid.uuid4().hex[:6]}"
        nickname = display_name or None
        tieba_uid = None
        portrait = None
        account_status = payload.status or AccountStatus.PENDING
        status_reason = "未验证（未调用百度接口）"
        last_login_at = None

    if db.scalar(select(Account).where(Account.username == username)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"账号名称已存在：{username}，请填写不同的备注名",
        )

    account = Account(
        username=username,
        nickname=nickname,
        bduss=bduss,
        stoken=stoken or None,
        status=account_status.value,
        status_reason=status_reason,
        tieba_uid=tieba_uid,
        portrait=portrait,
        proxy_id=payload.proxy_id,
        last_login_at=last_login_at,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    _auto_sync_follows(db, account)
    return account


@router.get("/{account_id}", response_model=AccountRead)
def get_account(account_id: int, db: DbSession) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    return account


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, db: DbSession) -> Account:
    exists = db.scalar(select(Account).where(Account.username == payload.username))
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该账号已存在")
    _validate_proxy_id(db, payload.proxy_id)

    account = Account(**payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    _auto_sync_follows(db, account)
    return account


@router.patch("/{account_id}", response_model=AccountRead)
def update_account(account_id: int, payload: AccountUpdate, db: DbSession) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")

    changes = payload.model_dump(exclude_unset=True)
    if "proxy_id" in changes:
        _validate_proxy_id(db, changes["proxy_id"])
    for field, value in changes.items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    if "bduss" in changes:
        _auto_sync_follows(db, account)
    return account


@router.post("/{account_id}/verify", response_model=AccountRead)
def verify_account(account_id: int, db: DbSession) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    if not account.bduss:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该账号未配置 BDUSS")

    effective_proxy = resolve_account_proxy(db, account)
    result = verify_credentials(
        account.bduss,
        account.stoken or "",
        proxy=effective_proxy.client_config if effective_proxy else None,
    )
    if result.valid:
        account.status = AccountStatus.VALID.value
        account.status_reason = None
        account.nickname = result.nickname or account.nickname
        account.tieba_uid = result.user_id or account.tieba_uid
        account.portrait = result.portrait or account.portrait
        account.last_login_at = datetime.now(UTC)
        if result.username and account.username.startswith("未验证账号_"):
            conflict = db.scalar(
                select(Account).where(
                    Account.username == result.username,
                    Account.id != account.id,
                )
            )
            if conflict is None:
                account.username = result.username
    elif result.status == "error":
        account.status_reason = (
            f"验证暂不可用：{result.error or '网络或服务异常'}"
        )[:500]
    else:
        account.status = AccountStatus.INVALID.value
        account.status_reason = (result.error or "验证失败")[:500]

    db.commit()
    db.refresh(account)
    if result.valid:
        _auto_sync_follows(db, account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: int, db: DbSession) -> None:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    db.delete(account)
    db.commit()
