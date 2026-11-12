from datetime import UTC, datetime

from aiotieba.config import ProxyConfig
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.core.tieba import fetch_followed_forums
from app.models.account import Account
from app.models.account_forum import AccountForum
from app.models.forum import Forum
from app.schemas.forum import ForumSyncResult
from app.services.sign_service import local_date


def _merge_suffix_duplicates(db: Session) -> int:
    merged = 0
    duplicates = list(db.scalars(select(Forum).where(Forum.fname.like("%吧"))).all())
    for duplicate in duplicates:
        normalized_name = duplicate.fname[:-1].strip()
        if not normalized_name:
            continue
        normalized = db.scalar(
            select(Forum).where(
                Forum.fname == normalized_name,
                Forum.source == duplicate.source,
            )
        )
        if normalized is None or normalized.id == duplicate.id:
            continue
        db.execute(delete(AccountForum).where(AccountForum.forum_id == duplicate.id))
        db.delete(duplicate)
        merged += 1
    if merged:
        db.flush()
    return merged


def sync_account_forums(
    db: Session,
    account: Account,
    timeout: float = 30.0,
    proxy: ProxyConfig | None = None,
) -> ForumSyncResult:
    """同步账号关注贴吧到账号关联表。"""
    if not account.bduss:
        raise ValueError("该账号未配置 BDUSS")

    followed = fetch_followed_forums(
        account.bduss,
        account.stoken or "",
        timeout=timeout,
        proxy=proxy,
    )
    now = datetime.now(UTC)
    added = 0
    updated = 0
    existing_links = {
        link.forum_id: link
        for link in db.scalars(
            select(AccountForum).where(AccountForum.account_id == account.id)
        ).all()
    }
    fetched_ids: set[int] = set()
    today = local_date(now)

    for item in followed:
        forum = db.scalar(
            select(Forum).where(or_(Forum.fname == item.fname, Forum.fid == item.fid))
        )
        if forum is None:
            forum = Forum(
                fid=item.fid,
                fname=item.fname,
                level=item.level,
                source="account",
            )
            db.add(forum)
            added += 1
        else:
            forum.fid = item.fid
            forum.fname = item.fname
            forum.level = item.level
            updated += 1
        forum.account_id = account.id
        forum.last_synced_at = now
        db.flush()

        link = existing_links.get(forum.id)
        if link is None:
            link = AccountForum(account_id=account.id, forum_id=forum.id)
            db.add(link)
            existing_links[forum.id] = link
        link.level = item.level
        link.is_followed = True
        local_success_today = (
            link.last_sign_status == "success"
            and local_date(link.last_sign_at) == today
        )
        if local_success_today:
            link.is_signed = True
        elif item.is_signed:
            link.is_signed = True
            if (
                link.last_sign_status != "success"
                or local_date(link.last_sign_at) != today
            ):
                link.last_sign_status = "success"
                link.last_sign_at = now
                link.sign_error = None
        else:
            link.is_signed = False
        link.hot_num = item.hot_num
        link.member_count = item.member_count
        link.today_thread_num = item.today_thread_num
        link.thread_num = item.thread_num
        link.last_synced_at = now
        link.follow_error = None
        fetched_ids.add(forum.id)

    for link in existing_links.values():
        if link.forum_id not in fetched_ids:
            link.is_followed = False

    _merge_suffix_duplicates(db)
    db.commit()
    return ForumSyncResult(
        fetched=len(followed),
        added=added,
        updated=updated,
        skipped=0,
        account_name=account.nickname or account.username,
    )
