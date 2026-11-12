from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.models.account import Account, AccountStatus
from app.models.account_forum import AccountForum
from app.models.forum import Forum
from app.models.material import Material
from app.models.post_task import PostTask, PostTaskLog
from app.schemas.post_task import (
    PostTaskCreate,
    PostTaskDetailResponse,
    PostTaskListResponse,
    PostTaskLogRead,
    PostTaskManagerStatus,
    PostTaskRead,
    PostTaskStats,
)
from app.services.app_settings import get_or_create_app_settings
from app.services.post_tasks import post_task_manager
from app.services.sign_service import local_now

router = APIRouter(prefix="/post-tasks", tags=["post-tasks"])


def _unique_ids(ids: list[int]) -> list[int]:
    return list(dict.fromkeys(ids))


def _prepare_task_payload(
    payload: PostTaskCreate,
    db: Session,
) -> tuple[list[int], list[int], list[int], int, datetime | None]:
    if payload.interval_min > payload.interval_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="发帖间隔最小值不能大于最大值",
        )

    account_ids = _unique_ids(payload.account_ids)
    forum_ids = _unique_ids(payload.forum_ids)
    material_ids = _unique_ids(payload.material_ids)

    accounts = list(
        db.scalars(select(Account).where(Account.id.in_(account_ids))).all()
    )
    if len(accounts) != len(account_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部分账号不存在")
    if any(not account.bduss for account in accounts):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="部分账号未配置 BDUSS",
        )
    unavailable_accounts = [
        account.nickname or account.username
        for account in accounts
        if account.status != AccountStatus.VALID.value
    ]
    if unavailable_accounts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"仅有效账号可以发帖：{'、'.join(unavailable_accounts)}",
        )

    forums = list(db.scalars(select(Forum).where(Forum.id.in_(forum_ids))).all())
    if len(forums) != len(forum_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部分贴吧不存在")
    banned_forums = [forum.fname for forum in forums if forum.is_banned]
    if banned_forums:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"已封禁贴吧不能发帖：{'、'.join(banned_forums)}",
        )
    banned_pairs = list(
        db.execute(
            select(AccountForum, Forum)
            .join(Forum, Forum.id == AccountForum.forum_id)
            .where(
                AccountForum.account_id.in_(account_ids),
                AccountForum.forum_id.in_(forum_ids),
                AccountForum.is_banned.is_(True),
            )
        ).all()
    )
    if banned_pairs:
        pair_names = sorted({forum.fname for _, forum in banned_pairs})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"所选账号在这些贴吧被封禁：{'、'.join(pair_names)}",
        )

    materials = list(
        db.scalars(select(Material).where(Material.id.in_(material_ids))).all()
    )
    if len(materials) != len(material_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部分素材不存在")
    disabled_materials = [
        material.title for material in materials if material.status == "disabled"
    ]
    if disabled_materials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"已停用素材不能用于任务：{'、'.join(disabled_materials)}",
        )

    total = len(account_ids) * len(forum_ids)
    settings = get_or_create_app_settings(db)
    if total > settings.max_task_total:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"单个任务最多 {settings.max_task_total} 条发帖"
                "（账号数 × 贴吧数）"
            ),
        )

    scheduled_at = payload.scheduled_at
    if scheduled_at is not None and scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=local_now().tzinfo)
    return account_ids, forum_ids, material_ids, total, scheduled_at


def _stats(db: Session) -> PostTaskStats:
    rows = db.execute(
        select(PostTask.status, func.count(PostTask.id)).group_by(PostTask.status)
    ).all()
    counts = {name: count for name, count in rows}
    return PostTaskStats(
        pending=counts.get("pending", 0),
        running=counts.get("running", 0),
        completed=counts.get("completed", 0),
        failed=counts.get("failed", 0),
        stopped=counts.get("stopped", 0),
    )


@router.get("", response_model=PostTaskListResponse)
def list_post_tasks(db: DbSession) -> PostTaskListResponse:
    post_task_manager.recover_stale_running(db)
    tasks = list(
        db.scalars(select(PostTask).order_by(PostTask.created_at.desc(), PostTask.id.desc())).all()
    )
    return PostTaskListResponse(
        items=[PostTaskRead.model_validate(task) for task in tasks],
        stats=_stats(db),
    )


@router.post("", response_model=PostTaskRead, status_code=status.HTTP_201_CREATED)
def create_post_task(payload: PostTaskCreate, db: DbSession) -> PostTask:
    account_ids, forum_ids, material_ids, total, scheduled_at = _prepare_task_payload(
        payload,
        db,
    )

    task = PostTask(
        name=(payload.name or "").strip() or f"发帖任务 {local_now():%m-%d %H:%M}",
        account_ids=account_ids,
        forum_ids=forum_ids,
        material_ids=material_ids,
        strategy="round_robin",
        interval_min=payload.interval_min,
        interval_max=payload.interval_max,
        scheduled_at=scheduled_at,
        status="pending",
        total=total,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=PostTaskRead)
def update_post_task(
    task_id: int,
    payload: PostTaskCreate,
    db: DbSession,
) -> PostTask:
    task = db.get(PostTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    if task.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="只有待执行任务可以修改；已完成、失败或停止的任务请复制后再修改",
        )

    account_ids, forum_ids, material_ids, total, scheduled_at = _prepare_task_payload(
        payload,
        db,
    )
    task.name = (payload.name or "").strip() or task.name
    task.account_ids = account_ids
    task.forum_ids = forum_ids
    task.material_ids = material_ids
    task.interval_min = payload.interval_min
    task.interval_max = payload.interval_max
    task.scheduled_at = scheduled_at
    task.total = total
    task.completed = 0
    task.success = 0
    task.failed = 0
    task.started_at = None
    task.finished_at = None
    task.last_error = None
    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/clone", response_model=PostTaskRead)
def clone_post_task(task_id: int, db: DbSession) -> PostTask:
    original = db.get(PostTask, task_id)
    if original is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    if original.status == "running":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="运行中的任务不能复制，请先停止",
        )

    task = PostTask(
        name=f"{original.name}（副本）",
        account_ids=list(original.account_ids or []),
        forum_ids=list(original.forum_ids or []),
        material_ids=list(original.material_ids or []),
        strategy=original.strategy,
        interval_min=original.interval_min,
        interval_max=original.interval_max,
        scheduled_at=None,
        status="pending",
        total=len(original.account_ids or []) * len(original.forum_ids or []),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/status", response_model=PostTaskManagerStatus)
def post_task_status() -> PostTaskManagerStatus:
    state = post_task_manager.status()
    return PostTaskManagerStatus(
        running=state.running,
        current_task_id=state.current_task_id,
        message=state.message,
    )


@router.post("/{task_id}/start", response_model=PostTaskRead)
async def start_post_task(task_id: int, db: DbSession) -> PostTask:
    try:
        await post_task_manager.start(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    task = db.get(PostTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    db.refresh(task)
    return task


@router.post("/{task_id}/stop", response_model=PostTaskRead)
async def stop_post_task(task_id: int, db: DbSession) -> PostTask:
    state = post_task_manager.status()
    if state.current_task_id != task_id or not state.running:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该任务当前未在运行",
        )
    await post_task_manager.stop()
    task = db.get(PostTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=PostTaskDetailResponse)
def get_post_task(task_id: int, db: DbSession) -> PostTaskDetailResponse:
    post_task_manager.recover_stale_running(db)
    task = db.get(PostTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    logs = list(
        db.scalars(
            select(PostTaskLog)
            .where(PostTaskLog.task_id == task_id)
            .order_by(PostTaskLog.created_at.desc(), PostTaskLog.id.desc())
        ).all()
    )
    return PostTaskDetailResponse(
        task=PostTaskRead.model_validate(task),
        logs=[PostTaskLogRead.model_validate(log) for log in logs],
    )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post_task(task_id: int, db: DbSession) -> None:
    task = db.get(PostTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    if task.status == "running":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="运行中的任务不能删除，请先停止",
        )
    db.execute(delete(PostTaskLog).where(PostTaskLog.task_id == task_id))
    db.delete(task)
    db.commit()
