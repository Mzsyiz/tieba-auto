from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tieba import SignResult
from app.models.account import Account
from app.models.account_forum import AccountForum
from app.models.forum import Forum
from app.models.sign_log import SignLog
from app.schemas.sign import SignItemResult


def local_now() -> datetime:
    return datetime.now().astimezone()


def local_date(value: datetime | None) -> date | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.date()
    return value.astimezone().date()


def reset_daily(db: Session, account_id: int) -> None:
    today = local_now().date()
    links = list(
        db.scalars(
            select(AccountForum).where(AccountForum.account_id == account_id)
        ).all()
    )
    changed = False
    for link in links:
        last_date = local_date(link.last_sign_at)
        if last_date is not None and last_date < today:
            link.is_signed = False
            link.last_sign_status = "pending"
            link.sign_error = None
            changed = True
    if changed:
        db.commit()


def account_links(db: Session, account_id: int) -> list[AccountForum]:
    stmt = (
        select(AccountForum)
        .join(Forum)
        .where(
            AccountForum.account_id == account_id,
            AccountForum.is_followed.is_(True),
        )
        .order_by(Forum.fname)
    )
    return list(db.execute(stmt).unique().scalars().all())


def apply_sign_results(
    db: Session,
    account: Account,
    links: list[AccountForum],
    results: list[SignResult],
    now: datetime | None = None,
) -> list[SignItemResult]:
    now = now or local_now()
    today = now.date()
    result_by_fname = {result.fname: result for result in results}
    items: list[SignItemResult] = []

    for link in links:
        result = result_by_fname.get(link.fname)
        if result is None:
            continue

        previous_date = local_date(link.last_sign_at)
        was_success_today = link.is_signed and previous_date == today
        was_failed_today = (
            not link.is_signed
            and link.last_sign_status == "failed"
            and previous_date == today
        )

        if result.success:
            if not was_success_today:
                if previous_date == today - timedelta(days=1):
                    link.sign_count += 1
                else:
                    link.sign_count = 1
                link.history_success += 1
            if was_failed_today:
                link.history_failed = max(0, link.history_failed - 1)
            link.is_signed = True
            link.last_sign_status = "success"
            link.sign_error = None
            link.last_sign_at = now
            log_status = "already" if result.already_signed else "success"
        else:
            if not was_failed_today:
                link.history_failed += 1
            link.is_signed = False
            link.last_sign_status = "failed"
            link.sign_error = (result.message or "签到失败")[:500]
            link.last_sign_at = now
            if result.banned:
                link.is_banned = True
                link.ban_reason = (result.message or "签到检测到封禁")[:500]
            log_status = "failed"

        db.add(
            SignLog(
                account_id=account.id,
                forum_id=link.forum_id,
                fname=link.fname,
                status=log_status,
                success=result.success,
                message=result.message,
                signed_at=now,
            )
        )
        items.append(
            SignItemResult(
                forum_id=link.forum_id,
                fname=link.fname,
                success=result.success,
                already_signed=result.already_signed,
                status=log_status,
                message=result.message,
            )
        )

    return items
