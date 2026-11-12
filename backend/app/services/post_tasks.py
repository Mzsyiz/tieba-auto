from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from datetime import UTC, datetime, tzinfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.poster import PostResult, publish_thread
from app.db.session import SessionLocal
from app.models.account import Account, AccountStatus
from app.models.account_forum import AccountForum
from app.models.forum import Forum
from app.models.material import Material
from app.models.post_task import PostTask, PostTaskLog
from app.services.app_settings import get_or_create_app_settings
from app.services.proxy_service import resolve_account_proxy
from app.services.sign_service import local_now


@dataclass
class PostTaskManagerState:
    running: bool = False
    current_task_id: int | None = None
    message: str = "空闲"


def _scheduled_in_timezone(value: datetime, timezone: tzinfo | None) -> datetime:
    if value.tzinfo is None:
        if timezone is None:
            timezone = UTC
        return value.replace(tzinfo=timezone)
    return value.astimezone(timezone)


def scheduled_task_is_due(task: PostTask, now: datetime | None = None) -> bool:
    if task.scheduled_at is None:
        return True
    current = now or local_now()
    return bool(_scheduled_in_timezone(task.scheduled_at, current.tzinfo) <= current)


class PostTaskManager:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop_event: asyncio.Event | None = None
        self._state = PostTaskManagerState()
        self._lock = asyncio.Lock()

    def status(self) -> PostTaskManagerState:
        return PostTaskManagerState(
            running=self._state.running,
            current_task_id=self._state.current_task_id,
            message=self._state.message,
        )

    def recover_stale_running(self, db: Session) -> int:
        """将服务中断后遗留的 running 任务收口，避免永久卡住。"""
        if self.status().running:
            return 0
        stale_tasks = list(
            db.scalars(select(PostTask).where(PostTask.status == "running")).all()
        )
        for task in stale_tasks:
            task.status = "stopped"
            task.finished_at = local_now()
            task.last_error = "服务重启或任务进程中断，任务已停止"
        if stale_tasks:
            db.commit()
        return len(stale_tasks)

    async def start(self, task_id: int) -> PostTaskManagerState:
        async with self._lock:
            if self._task is not None and not self._task.done():
                raise RuntimeError("已有发帖任务正在执行")
            from app.services.auto_sign import auto_sign_manager

            if auto_sign_manager.status().running:
                raise RuntimeError("自动签到正在运行，暂不能启动发帖任务")
            with SessionLocal() as db:
                self.recover_stale_running(db)
                task = db.get(PostTask, task_id)
                if task is None:
                    raise ValueError("任务不存在")
                if task.status != "pending":
                    raise ValueError("只有待执行任务可以开始")
                scheduled_at = task.scheduled_at
                if scheduled_at is not None and not scheduled_task_is_due(task):
                    scheduled = _scheduled_in_timezone(scheduled_at, local_now().tzinfo)
                    raise ValueError(
                        f"任务计划时间为 {scheduled:%Y-%m-%d %H:%M:%S}，尚未到执行时间"
                    )
                task.status = "running"
                task.started_at = local_now()
                task.finished_at = None
                task.completed = 0
                task.success = 0
                task.failed = 0
                task.last_error = None
                db.commit()

            self._stop_event = asyncio.Event()
            self._state = PostTaskManagerState(
                running=True,
                current_task_id=task_id,
                message="准备中",
            )
            self._task = asyncio.create_task(self._run(task_id))
        return self.status()

    async def stop(self) -> PostTaskManagerState:
        if self._task is not None and not self._task.done() and self._stop_event is not None:
            self._stop_event.set()
            self._state.message = "正在停止…"
        return self.status()

    async def shutdown(self) -> None:
        if self._task is None or self._task.done():
            return
        if self._stop_event is not None:
            self._stop_event.set()
        try:
            await asyncio.wait_for(self._task, timeout=10)
        except Exception:  # noqa: BLE001
            self._task.cancel()

    def _build_jobs(self, task: PostTask) -> list[tuple[int, int, int]]:
        material_ids = list(task.material_ids or [])
        if not material_ids:
            return []

        jobs: list[tuple[int, int, int]] = []
        material_index = 0
        for forum_id in task.forum_ids:
            for account_id in task.account_ids:
                jobs.append(
                    (
                        account_id,
                        forum_id,
                        material_ids[material_index % len(material_ids)],
                    )
                )
                material_index += 1
        return jobs

    async def _run(self, task_id: int) -> None:
        stop = self._stop_event
        success = 0
        failed = 0
        try:
            with SessionLocal() as db:
                task = db.get(PostTask, task_id)
                if task is None:
                    return
                jobs = self._build_jobs(task)
                task.total = len(jobs)
                db.commit()

            if not jobs:
                with SessionLocal() as db:
                    task = db.get(PostTask, task_id)
                    if task is not None:
                        task.status = "failed"
                        task.finished_at = local_now()
                        task.last_error = "没有可执行的任务数据"
                        db.commit()
                return

            for index, (account_id, forum_id, material_id) in enumerate(jobs):
                if stop is not None and stop.is_set():
                    break
                self._state.message = f"发帖中 {index + 1}/{len(jobs)}"

                with SessionLocal() as db:
                    account = db.get(Account, account_id)
                    forum = db.get(Forum, forum_id)
                    material = db.get(Material, material_id)
                    unavailable_reason = ""
                    if account is None:
                        unavailable_reason = "账号已被删除"
                    elif not account.bduss:
                        unavailable_reason = "账号未配置 BDUSS"
                    elif account.status != AccountStatus.VALID.value:
                        unavailable_reason = (
                            f"账号状态不可用：{account.status}"
                        )
                    elif forum is None:
                        unavailable_reason = "贴吧已被删除"
                    elif forum.is_banned:
                        unavailable_reason = "贴吧已封禁"
                    elif (
                        db.scalar(
                            select(AccountForum).where(
                                AccountForum.account_id == account.id,
                                AccountForum.forum_id == forum.id,
                                AccountForum.is_banned.is_(True),
                            )
                        )
                        is not None
                    ):
                        unavailable_reason = "当前账号在该贴吧被封禁"
                    elif material is None:
                        unavailable_reason = "素材已被删除"
                    elif material.status == "disabled":
                        unavailable_reason = "素材已停用"

                    if unavailable_reason:
                        failed += 1
                        task = db.get(PostTask, task_id)
                        if task is not None:
                            task.completed += 1
                            task.failed += 1
                            task.last_error = unavailable_reason
                            db.add(
                                PostTaskLog(
                                    task_id=task_id,
                                    account_id=account_id,
                                    account_name=account.nickname or account.username
                                    if account
                                    else "",
                                    forum_id=forum_id,
                                    fname=forum.fname if forum else "",
                                    material_id=material_id,
                                    title=material.title if material else "",
                                    status="failed",
                                    message=unavailable_reason,
                                    created_at=local_now(),
                                )
                            )
                            db.commit()
                        continue

                    assert account is not None
                    assert forum is not None
                    assert material is not None
                    bduss = account.bduss or ""
                    stoken = account.stoken or ""
                    account_name = account.nickname or account.username
                    fname = forum.fname
                    title = material.title
                    content = material.content
                    image_urls = list(material.image_urls or [])
                    is_video_post = material.post_type == "video"
                    effective_proxy = resolve_account_proxy(db, account)
                    settings = get_or_create_app_settings(db)
                    proxy_config = (
                        effective_proxy.client_config if effective_proxy else None
                    )
                    proxy_url = effective_proxy.httpx_url if effective_proxy else None
                    prewarm_min = settings.post_prewarm_min
                    prewarm_max = settings.post_prewarm_max
                    request_timeout = float(settings.request_timeout_seconds)

                result = (
                    PostResult(
                        False,
                        message="该素材是视频帖，自动视频发布通道尚未接入",
                    )
                    if is_video_post
                    else await publish_thread(
                        bduss,
                        stoken,
                        fname,
                        title,
                        content,
                        image_urls,
                        proxy=proxy_config,
                        proxy_url=proxy_url,
                        prewarm_min=prewarm_min,
                        prewarm_max=prewarm_max,
                        request_timeout=request_timeout,
                    )
                )
                now = local_now()

                with SessionLocal() as db:
                    task = db.get(PostTask, task_id)
                    if task is None:
                        break
                    task.completed += 1
                    if result.success:
                        success += 1
                        task.success += 1
                        material = db.get(Material, material_id)
                        if material is not None:
                            material.usage_count += 1
                            material.last_used_at = now
                            material.status = "used"
                    else:
                        failed += 1
                        task.failed += 1
                        task.last_error = result.message[:500]
                    db.add(
                        PostTaskLog(
                            task_id=task_id,
                            account_id=account_id,
                            account_name=account_name,
                            forum_id=forum_id,
                            fname=fname,
                            material_id=material_id,
                            title=title,
                            status="success" if result.success else "failed",
                            tid=result.tid or None,
                            message=result.message,
                            created_at=now,
                        )
                    )
                    db.commit()
                    interval_min = task.interval_min
                    interval_max = task.interval_max

                if index < len(jobs) - 1:
                    delay = random.uniform(
                        max(interval_min, 0),
                        max(interval_max, interval_min, 0),
                    )
                    if stop is not None:
                        try:
                            await asyncio.wait_for(stop.wait(), timeout=delay)
                            break
                        except TimeoutError:
                            pass
                    else:
                        await asyncio.sleep(delay)

            stopped = stop is not None and stop.is_set()
            with SessionLocal() as db:
                task = db.get(PostTask, task_id)
                if task is not None:
                    task.finished_at = local_now()
                    task.status = (
                        "stopped"
                        if stopped
                        else "completed"
                        if success > 0
                        else "failed"
                    )
                    if not stopped and success == 0 and failed == 0:
                        task.last_error = "没有实际执行任何发帖"
                    db.commit()
            self._state.message = "已停止" if stopped else "全部完成"
        except Exception as exc:  # noqa: BLE001
            with SessionLocal() as db:
                task = db.get(PostTask, task_id)
                if task is not None:
                    task.status = "failed"
                    task.finished_at = local_now()
                    task.last_error = f"{type(exc).__name__}: {exc}"[:500]
                    db.commit()
            self._state.message = f"失败：{exc}"
        finally:
            self._state.running = False
            self._state.current_task_id = None
            if self._stop_event is not None:
                self._stop_event.clear()


post_task_manager = PostTaskManager()


async def post_task_scheduler_loop() -> None:
    await asyncio.sleep(5)
    while True:
        try:
            if not post_task_manager.status().running:
                with SessionLocal() as db:
                    post_task_manager.recover_stale_running(db)
                    pending = list(
                        db.scalars(
                            select(PostTask)
                            .where(
                                PostTask.status == "pending",
                                PostTask.scheduled_at.is_not(None),
                            )
                            .order_by(PostTask.scheduled_at)
                        ).all()
                    )
                now = local_now()
                for task in pending:
                    if scheduled_task_is_due(task, now):
                        await post_task_manager.start(task.id)
                        break
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(20)
