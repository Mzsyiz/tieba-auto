import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.core.tieba import update_follow_relations
from app.models.account import Account
from app.models.account_forum import AccountForum
from app.models.forum import Forum
from app.schemas.forum import (
    AccountForumListResponse,
    AccountForumRead,
    AccountForumStats,
    ForumBulkCreateResult,
    ForumCreateRequest,
    ForumFollowItem,
    ForumFollowRequest,
    ForumFollowResult,
    ForumListResponse,
    ForumPoolImportRequest,
    ForumPoolImportResult,
    ForumRead,
    ForumStats,
    ForumSyncRequest,
    ForumSyncResult,
    ForumUpdate,
)
from app.services.app_settings import get_or_create_app_settings
from app.services.forum_sync import sync_account_forums
from app.services.proxy_service import resolve_account_proxy

router = APIRouter(prefix="/forums", tags=["forums"])


def _split_names(raw: str) -> list[str]:
    seen: set[str] = set()
    names: list[str] = []
    for part in re.split(r"[\s,，;；]+", raw.strip()):
        name = part.strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        names.append(name)
    return names


def _stats(db: Session) -> ForumStats:
    total = db.scalar(select(func.count(Forum.id)).where(Forum.source == "manual")) or 0
    banned = (
        db.scalar(
            select(func.count(Forum.id)).where(
                Forum.source == "manual",
                Forum.is_banned.is_(True),
            )
        )
        or 0
    )
    targets = (
        db.scalar(
            select(func.count(Forum.id)).where(
                Forum.source == "manual",
                Forum.is_post_target.is_(True),
            )
        )
        or 0
    )
    return ForumStats(total=total, active=total - banned, banned=banned, post_targets=targets)


def _followed_ids(db: Session, account_id: int) -> set[int]:
    return set(
        db.scalars(
            select(AccountForum.forum_id).where(
                AccountForum.account_id == account_id,
                AccountForum.is_followed.is_(True),
            )
        ).all()
    )


@router.get("", response_model=ForumListResponse)
def list_forums(
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    post_target: Annotated[bool | None, Query()] = None,
    account_id: Annotated[int | None, Query()] = None,
    follow_state: Annotated[str | None, Query()] = None,
) -> ForumListResponse:
    followed = _followed_ids(db, account_id) if account_id is not None else set()

    stmt = select(Forum).where(Forum.source == "manual").order_by(Forum.fname)
    if q:
        stmt = stmt.where(Forum.fname.ilike(f"%{q}%"))
    if status_filter == "active":
        stmt = stmt.where(Forum.is_banned.is_(False))
    elif status_filter == "banned":
        stmt = stmt.where(Forum.is_banned.is_(True))
    if post_target is not None:
        stmt = stmt.where(Forum.is_post_target.is_(post_target))
    if follow_state == "followed":
        if not followed:
            return ForumListResponse(items=[], total=0, stats=_stats(db))
        stmt = stmt.where(Forum.id.in_(followed))
    elif follow_state == "unfollowed" and followed:
        stmt = stmt.where(~Forum.id.in_(followed))

    rows = list(db.scalars(stmt).unique().all())
    items: list[ForumRead] = []
    for forum in rows:
        item = ForumRead.model_validate(forum)
        if account_id is not None:
            item.followed_by_account = forum.id in followed
        items.append(item)
    return ForumListResponse(items=items, total=len(items), stats=_stats(db))


@router.post("", response_model=ForumBulkCreateResult, status_code=status.HTTP_201_CREATED)
def create_forums(payload: ForumCreateRequest, db: DbSession) -> ForumBulkCreateResult:
    names = _split_names(payload.names)
    if not names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请至少输入一个贴吧名",
        )

    if payload.account_id is not None and db.get(Account, payload.account_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")

    affected: list[Forum] = []
    added = 0
    promoted = 0
    existing = 0
    processed: set[str] = set()

    def apply_metadata(forum: Forum) -> None:
        if payload.account_id is not None:
            forum.account_id = payload.account_id
        if payload.is_post_target:
            forum.is_post_target = True
        note = (payload.notes or "").strip()
        if note:
            forum.notes = note

    def add_or_promote(forum: Forum) -> None:
        nonlocal promoted, existing
        if forum.source == "manual":
            existing += 1
        else:
            forum.source = "manual"
            promoted += 1
        apply_metadata(forum)
        if forum not in affected:
            affected.append(forum)

    for name in names:
        if name in processed:
            existing += 1
            continue
        processed.add(name)
        forum = db.scalar(select(Forum).where(Forum.fname == name))
        if forum is None and name.endswith("吧"):
            normalized_name = name[:-1].strip()
            if normalized_name:
                forum = db.scalar(select(Forum).where(Forum.fname == normalized_name))
                if forum is not None:
                    processed.add(normalized_name)
        if forum is not None:
            add_or_promote(forum)
            continue
        forum = Forum(
            fname=name,
            source="manual",
            account_id=payload.account_id,
            is_post_target=payload.is_post_target,
            notes=(payload.notes or "").strip() or None,
        )
        db.add(forum)
        db.flush()
        added += 1
        affected.append(forum)

    db.commit()
    for forum in affected:
        db.refresh(forum)
    return ForumBulkCreateResult(
        added=added,
        promoted=promoted,
        existing=existing,
        items=[ForumRead.model_validate(item) for item in affected],
    )


@router.post("/pool/import", response_model=ForumPoolImportResult)
def import_forums_to_pool(
    payload: ForumPoolImportRequest,
    db: DbSession,
) -> ForumPoolImportResult:
    unique_ids = list(dict.fromkeys(payload.forum_ids))
    forums = list(db.scalars(select(Forum).where(Forum.id.in_(unique_ids))).all())
    if len(forums) != len(unique_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部分贴吧不存在")

    promoted = 0
    existing = 0
    for forum in forums:
        if forum.source == "manual":
            existing += 1
        else:
            forum.source = "manual"
            promoted += 1
    db.commit()
    for forum in forums:
        db.refresh(forum)
    return ForumPoolImportResult(
        promoted=promoted,
        existing=existing,
        items=[ForumRead.model_validate(item) for item in forums],
    )


@router.post("/sync", response_model=ForumSyncResult)
def sync_forums(payload: ForumSyncRequest, db: DbSession) -> ForumSyncResult:
    account = db.get(Account, payload.account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    if not account.bduss:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该账号未配置 BDUSS")

    effective_proxy = resolve_account_proxy(db, account)
    settings = get_or_create_app_settings(db)
    try:
        return sync_account_forums(
            db,
            account,
            timeout=settings.request_timeout_seconds,
            proxy=effective_proxy.client_config if effective_proxy else None,
        )
    except TimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"同步失败：{exc}",
        ) from exc


@router.get("/accounts/{account_id}", response_model=AccountForumListResponse)
def list_account_forums(
    account_id: int,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> AccountForumListResponse:
    if db.get(Account, account_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")

    stmt = (
        select(AccountForum)
        .join(Forum)
        .where(AccountForum.account_id == account_id)
        .order_by(Forum.fname)
    )
    if q:
        stmt = stmt.where(Forum.fname.ilike(f"%{q}%"))
    if status_filter == "followed":
        stmt = stmt.where(AccountForum.is_followed.is_(True))
    elif status_filter == "unfollowed":
        stmt = stmt.where(AccountForum.is_followed.is_(False))
    elif status_filter == "banned":
        stmt = stmt.where(AccountForum.is_banned.is_(True))

    rows = list(db.execute(stmt).unique().scalars().all())
    all_links = list(
        db.scalars(select(AccountForum).where(AccountForum.account_id == account_id)).all()
    )
    stats = AccountForumStats(
        total=len(all_links),
        followed=sum(1 for link in all_links if link.is_followed),
        banned=sum(1 for link in all_links if link.is_banned),
        signed=sum(1 for link in all_links if link.is_signed),
    )
    return AccountForumListResponse(
        items=[AccountForumRead.model_validate(item) for item in rows],
        total=len(rows),
        stats=stats,
    )


@router.post(
    "/accounts/{account_id}/forums/{forum_id}/unban",
    response_model=AccountForumRead,
)
def clear_account_forum_ban(
    account_id: int,
    forum_id: int,
    db: DbSession,
) -> AccountForum:
    link = db.scalar(
        select(AccountForum).where(
            AccountForum.account_id == account_id,
            AccountForum.forum_id == forum_id,
        )
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="账号贴吧关联不存在",
        )
    link.is_banned = False
    link.ban_reason = None
    link.last_sign_status = "pending"
    link.sign_error = None
    db.commit()
    db.refresh(link)
    return link


def _bulk_follow(
    payload: ForumFollowRequest,
    db: Session,
    *,
    unfollow: bool,
) -> ForumFollowResult:
    account = db.get(Account, payload.account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    if not account.bduss:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该账号未配置 BDUSS")

    unique_ids = list(dict.fromkeys(payload.forum_ids))
    forums = list(db.scalars(select(Forum).where(Forum.id.in_(unique_ids))).all())
    by_id = {forum.id: forum for forum in forums}
    if len(by_id) != len(unique_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部分贴吧不存在")

    try:
        effective_proxy = resolve_account_proxy(db, account)
        settings = get_or_create_app_settings(db)
        actions = update_follow_relations(
            account.bduss,
            account.stoken or "",
            [by_id[forum_id].fname for forum_id in unique_ids],
            unfollow=unfollow,
            timeout=max(settings.request_timeout_seconds * len(unique_ids), 60),
            interval_min=settings.follow_interval_min,
            interval_max=settings.follow_interval_max,
            proxy=effective_proxy.client_config if effective_proxy else None,
        )
    except TimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"操作失败：{exc}",
        ) from exc

    now = datetime.now(UTC)
    action_by_name = {action.fname: action for action in actions}
    items: list[ForumFollowItem] = []
    for forum_id in unique_ids:
        forum = db.get(Forum, forum_id)
        if forum is None:
            continue
        action = action_by_name.get(forum.fname)
        if action is None:
            continue

        target_forum = forum
        if action.success and action.resolved_fname and action.resolved_fname != forum.fname:
            normalized_forum = db.scalar(
                select(Forum).where(Forum.fname == action.resolved_fname)
            )
            if normalized_forum is not None and normalized_forum.id != forum.id:
                target_forum = normalized_forum
                db.execute(delete(AccountForum).where(AccountForum.forum_id == forum.id))
                db.delete(forum)
                db.flush()
            else:
                forum.fname = action.resolved_fname

        link = db.scalar(
            select(AccountForum).where(
                AccountForum.account_id == account.id,
                AccountForum.forum_id == target_forum.id,
            )
        )
        if link is None:
            link = AccountForum(
                account_id=account.id,
                forum_id=target_forum.id,
                is_followed=False,
            )
            db.add(link)
        if action.success:
            link.is_followed = not unfollow
            link.follow_error = None
            link.last_synced_at = now
        else:
            link.follow_error = (action.error or "操作失败")[:500]
        items.append(
            ForumFollowItem(
                forum_id=target_forum.id,
                fname=target_forum.fname,
                success=action.success,
                message=action.error,
            )
        )

    db.commit()
    success = sum(1 for item in items if item.success)
    return ForumFollowResult(success=success, failed=len(items) - success, items=items)


@router.post("/follow", response_model=ForumFollowResult)
def follow_forums(payload: ForumFollowRequest, db: DbSession) -> ForumFollowResult:
    return _bulk_follow(payload, db, unfollow=False)


@router.post("/unfollow", response_model=ForumFollowResult)
def unfollow_forums(payload: ForumFollowRequest, db: DbSession) -> ForumFollowResult:
    return _bulk_follow(payload, db, unfollow=True)


@router.patch("/{forum_id}", response_model=ForumRead)
def update_forum(forum_id: int, payload: ForumUpdate, db: DbSession) -> Forum:
    forum = db.get(Forum, forum_id)
    if forum is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="贴吧不存在")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(forum, field, value)
    if changes.get("is_banned") is False:
        forum.ban_reason = None
    db.commit()
    db.refresh(forum)
    return forum


@router.delete("/{forum_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_forum(forum_id: int, db: DbSession) -> None:
    forum = db.get(Forum, forum_id)
    if forum is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="贴吧不存在")
    db.delete(forum)
    db.commit()
