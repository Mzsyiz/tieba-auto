from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DbSession
from app.core.tieba import sign_forums_sync
from app.models.account import Account
from app.models.account_forum import AccountForum
from app.models.sign_log import SignLog
from app.schemas.auto_sign import (
    AutoSignSettingsRead,
    AutoSignSettingsUpdate,
    AutoSignStartRequest,
    AutoSignStateRead,
)
from app.schemas.sign import (
    SignItemRead,
    SignLogListResponse,
    SignLogRead,
    SignOverviewResponse,
    SignRequest,
    SignRunResult,
    SignStats,
)
from app.services.app_settings import get_or_create_app_settings
from app.services.auto_sign import auto_sign_manager, get_or_create_settings
from app.services.proxy_service import resolve_account_proxy
from app.services.sign_service import (
    account_links,
    apply_sign_results,
    local_now,
    reset_daily,
)

router = APIRouter(prefix="/sign", tags=["sign"])


def _build_item(link: AccountForum) -> SignItemRead:
    return SignItemRead(
        forum_id=link.forum_id,
        fname=link.fname,
        level=link.level,
        is_followed=link.is_followed,
        is_banned=link.is_banned,
        ban_reason=link.ban_reason,
        is_signed=link.is_signed,
        last_sign_status=link.last_sign_status,
        last_sign_at=link.last_sign_at,
        sign_count=link.sign_count,
        history_success=link.history_success,
        history_failed=link.history_failed,
        sign_error=link.sign_error,
    )


def _stats(links: list[AccountForum]) -> SignStats:
    total = len(links)
    signed = sum(1 for link in links if link.is_signed and not link.is_banned)
    banned = sum(1 for link in links if link.is_banned)
    failed = sum(
        1
        for link in links
        if not link.is_signed and not link.is_banned and link.last_sign_status == "failed"
    )
    pending = max(total - signed - failed - banned, 0)
    return SignStats(
        total=total,
        signed=signed,
        pending=pending,
        failed=failed,
        banned=banned,
    )


@router.get("/accounts/{account_id}", response_model=SignOverviewResponse)
def get_sign_overview(account_id: int, db: DbSession) -> SignOverviewResponse:
    if db.get(Account, account_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    reset_daily(db, account_id)
    links = account_links(db, account_id)
    return SignOverviewResponse(
        items=[_build_item(link) for link in links],
        total=len(links),
        stats=_stats(links),
    )


@router.post("/accounts/{account_id}/sign", response_model=SignRunResult)
def run_sign(
    account_id: int,
    payload: SignRequest,
    db: DbSession,
) -> SignRunResult:
    if auto_sign_manager.status().running:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="自动签到正在运行，请停止后再执行单独签到",
        )
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    if not account.bduss:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该账号未配置 BDUSS")

    reset_daily(db, account_id)
    links = account_links(db, account_id)
    link_by_forum = {link.forum_id: link for link in links}

    if payload.forum_ids:
        requested_ids = list(dict.fromkeys(payload.forum_ids))
        missing_ids = [
            forum_id for forum_id in requested_ids if forum_id not in link_by_forum
        ]
        if missing_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"部分贴吧不在该账号关注列表中：{missing_ids}",
            )
        selected = [
            link_by_forum[forum_id]
            for forum_id in requested_ids
        ]
        banned = [link.fname for link in selected if link.is_banned]
        if banned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"已封禁贴吧不能签到：{'、'.join(banned)}",
            )
    else:
        selected = [
            link for link in links if not link.is_signed and not link.is_banned
        ]

    if not selected:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="没有待签到的贴吧")

    targets: list[str] = []
    for link in selected:
        if link.fname not in targets:
            targets.append(link.fname)

    try:
        effective_proxy = resolve_account_proxy(db, account)
        settings = get_or_create_app_settings(db)
        results = sign_forums_sync(
            account.bduss,
            account.stoken or "",
            targets,
            timeout=max(settings.request_timeout_seconds * len(targets), 60),
            interval_min=settings.sign_interval_min,
            interval_max=settings.sign_interval_max,
            proxy=effective_proxy.client_config if effective_proxy else None,
        )
    except TimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"签到失败：{exc}",
        ) from exc

    items = apply_sign_results(db, account, selected, results, local_now())
    db.commit()
    success_count = sum(1 for item in items if item.success and not item.already_signed)
    already_count = sum(1 for item in items if item.already_signed)
    failed_count = sum(1 for item in items if not item.success)
    return SignRunResult(
        success=success_count,
        already=already_count,
        failed=failed_count,
        items=items,
    )


@router.get("/logs", response_model=SignLogListResponse)
def list_sign_logs(
    db: DbSession,
    account_id: Annotated[int | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> SignLogListResponse:
    stmt = select(SignLog).order_by(SignLog.signed_at.desc(), SignLog.id.desc()).limit(limit)
    if account_id is not None:
        stmt = stmt.where(SignLog.account_id == account_id)
    items = list(db.scalars(stmt).all())
    return SignLogListResponse(items=[SignLogRead.model_validate(item) for item in items])


@router.get("/auto/settings", response_model=AutoSignSettingsRead)
def get_auto_settings(db: DbSession) -> AutoSignSettingsRead:
    settings = get_or_create_settings(db)
    return AutoSignSettingsRead.model_validate(settings)


@router.put("/auto/settings", response_model=AutoSignSettingsRead)
def update_auto_settings(
    payload: AutoSignSettingsUpdate,
    db: DbSession,
) -> AutoSignSettingsRead:
    if payload.interval_min > payload.interval_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="贴吧间隔最小值不能大于最大值",
        )
    if payload.account_interval_min > payload.account_interval_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="账号间隔最小值不能大于最大值",
        )

    settings = get_or_create_settings(db)
    settings.enabled = payload.enabled
    settings.schedule_time = payload.schedule_time
    settings.interval_min = payload.interval_min
    settings.interval_max = payload.interval_max
    settings.account_interval_min = payload.account_interval_min
    settings.account_interval_max = payload.account_interval_max
    settings.account_ids = payload.account_ids
    db.commit()
    db.refresh(settings)
    return AutoSignSettingsRead.model_validate(settings)


@router.post("/auto/start", response_model=AutoSignStateRead)
async def start_auto_sign(
    payload: AutoSignStartRequest,
    db: DbSession,
) -> AutoSignStateRead:
    settings = get_or_create_settings(db)
    account_ids = (
        payload.account_ids
        if payload.account_ids is not None
        else list(settings.account_ids or [])
    )
    try:
        state = await auto_sign_manager.start(
            account_ids,
            settings.interval_min,
            settings.interval_max,
            settings.account_interval_min,
            settings.account_interval_max,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return AutoSignStateRead.model_validate(state)


@router.post("/auto/stop", response_model=AutoSignStateRead)
async def stop_auto_sign() -> AutoSignStateRead:
    return AutoSignStateRead.model_validate(await auto_sign_manager.stop())


@router.get("/auto/status", response_model=AutoSignStateRead)
def auto_sign_status() -> AutoSignStateRead:
    return AutoSignStateRead.model_validate(auto_sign_manager.status())
