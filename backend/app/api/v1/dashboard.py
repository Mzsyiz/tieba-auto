from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.models.account import Account, AccountStatus
from app.models.account_forum import AccountForum
from app.models.forum import Forum
from app.models.material import Material
from app.models.post_task import PostTask, PostTaskLog
from app.models.proxy import ProxyNode
from app.models.sign_log import SignLog
from app.schemas.dashboard import (
    DashboardOverview,
    DashboardRecentPostFailure,
    DashboardRecentSign,
    DashboardRecentTask,
    DashboardResponse,
    DashboardRunnerStatus,
    DashboardSignStats,
    DashboardTaskStats,
)
from app.services.auto_sign import auto_sign_manager
from app.services.post_tasks import post_task_manager
from app.services.sign_service import local_now

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(db: DbSession) -> DashboardResponse:
    post_task_manager.recover_stale_running(db)
    now = local_now()
    today_start = datetime.combine(
        now.date(),
        time.min,
        tzinfo=now.tzinfo,
    ).astimezone(UTC)
    week_start = today_start - timedelta(days=6)

    account_total = db.scalar(select(func.count(Account.id))) or 0
    account_valid = (
        db.scalar(
            select(func.count(Account.id)).where(
                Account.status == AccountStatus.VALID.value,
            )
        )
        or 0
    )
    account_with_credentials = (
        db.scalar(
            select(func.count(Account.id)).where(
                Account.bduss.is_not(None),
                Account.bduss != "",
            )
        )
        or 0
    )
    followed_forums = (
        db.scalar(
            select(func.count(AccountForum.id)).where(
                AccountForum.is_followed.is_(True)
            )
        )
        or 0
    )
    manual_forums = (
        db.scalar(select(func.count(Forum.id)).where(Forum.source == "manual")) or 0
    )
    material_total = db.scalar(select(func.count(Material.id))) or 0
    material_video = (
        db.scalar(select(func.count(Material.id)).where(Material.post_type == "video"))
        or 0
    )

    proxies = list(db.scalars(select(ProxyNode)).all())
    proxy_total = len(proxies)
    proxy_active = sum(1 for proxy in proxies if proxy.is_active)
    proxy_online = sum(
        1
        for proxy in proxies
        if proxy.is_active
        and proxy.last_checked_at is not None
        and proxy.last_error is None
    )

    task_rows = db.execute(
        select(PostTask.status, func.count(PostTask.id)).group_by(PostTask.status)
    ).all()
    task_counts = {status: count for status, count in task_rows}
    jobs_total, jobs_success, jobs_failed = db.execute(
        select(
            func.coalesce(func.sum(PostTask.total), 0),
            func.coalesce(func.sum(PostTask.success), 0),
            func.coalesce(func.sum(PostTask.failed), 0),
        )
    ).one()

    today_rows = db.execute(
        select(SignLog.status, func.count(SignLog.id))
        .where(SignLog.signed_at >= today_start)
        .group_by(SignLog.status)
    ).all()
    today_counts = {status: count for status, count in today_rows}
    week_success = (
        db.scalar(
            select(func.count(SignLog.id)).where(
                SignLog.signed_at >= week_start,
                SignLog.status.in_(["success", "already"]),
            )
        )
        or 0
    )
    week_failed = (
        db.scalar(
            select(func.count(SignLog.id)).where(
                SignLog.signed_at >= week_start,
                SignLog.status == "failed",
            )
        )
        or 0
    )

    recent_tasks = list(
        db.scalars(
            select(PostTask)
            .order_by(PostTask.created_at.desc(), PostTask.id.desc())
            .limit(5)
        ).all()
    )
    recent_sign_rows = list(
        db.execute(
            select(SignLog, Account)
            .join(Account, Account.id == SignLog.account_id)
            .order_by(SignLog.signed_at.desc(), SignLog.id.desc())
            .limit(6)
        ).all()
    )
    recent_failures = list(
        db.scalars(
            select(PostTaskLog)
            .where(PostTaskLog.status == "failed")
            .order_by(PostTaskLog.created_at.desc(), PostTaskLog.id.desc())
            .limit(5)
        ).all()
    )

    auto_state = auto_sign_manager.status()
    post_state = post_task_manager.status()
    return DashboardResponse(
        overview=DashboardOverview(
            account_total=account_total,
            account_valid=account_valid,
            account_with_credentials=account_with_credentials,
            followed_forums=followed_forums,
            manual_forums=manual_forums,
            material_total=material_total,
            material_video=material_video,
            proxy_total=proxy_total,
            proxy_active=proxy_active,
            proxy_online=proxy_online,
        ),
        tasks=DashboardTaskStats(
            total=sum(task_counts.values()),
            pending=task_counts.get("pending", 0),
            running=task_counts.get("running", 0),
            completed=task_counts.get("completed", 0),
            failed=task_counts.get("failed", 0),
            stopped=task_counts.get("stopped", 0),
            jobs_total=int(jobs_total),
            jobs_success=int(jobs_success),
            jobs_failed=int(jobs_failed),
        ),
        signs=DashboardSignStats(
            today_total=sum(today_counts.values()),
            success=today_counts.get("success", 0),
            already=today_counts.get("already", 0),
            failed=today_counts.get("failed", 0),
            seven_day_success=week_success,
            seven_day_failed=week_failed,
        ),
        runners=DashboardRunnerStatus(
            auto_sign_running=auto_state.running,
            auto_sign_message=auto_state.message,
            post_task_running=post_state.running,
            post_task_message=post_state.message,
        ),
        recent_tasks=[
            DashboardRecentTask(
                id=task.id,
                name=task.name,
                status=task.status,
                total=task.total,
                completed=task.completed,
                success=task.success,
                failed=task.failed,
                scheduled_at=task.scheduled_at,
                created_at=task.created_at,
            )
            for task in recent_tasks
        ],
        recent_signs=[
            DashboardRecentSign(
                id=log.id,
                account_name=account.nickname or account.username,
                fname=log.fname,
                status=log.status,
                message=log.message,
                signed_at=log.signed_at,
            )
            for log, account in recent_sign_rows
        ],
        recent_post_failures=[
            DashboardRecentPostFailure(
                id=log.id,
                account_name=log.account_name,
                fname=log.fname,
                title=log.title,
                message=log.message,
                created_at=log.created_at,
            )
            for log in recent_failures
        ],
        generated_at=now,
    )
