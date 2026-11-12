from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field, replace
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tieba import SignResult, sign_forums_async
from app.db.session import SessionLocal
from app.models.account import Account
from app.models.auto_sign import AutoSignSetting
from app.services.proxy_service import resolve_account_proxy
from app.services.sign_service import (
    account_links,
    apply_sign_results,
    local_now,
    reset_daily,
)


@dataclass
class AutoSignState:
    running: bool = False
    started_at: datetime | None = None
    finished_at: datetime | None = None
    current_account_id: int | None = None
    current_account_name: str = ""
    account_index: int = 0
    account_total: int = 0
    current_forum: str = ""
    forum_index: int = 0
    forum_total: int = 0
    success: int = 0
    already: int = 0
    failed: int = 0
    skipped: int = 0
    message: str = "空闲"
    recent_errors: list[str] = field(default_factory=list)

    def snapshot(self) -> AutoSignState:
        return replace(self, recent_errors=list(self.recent_errors))


class AutoSignManager:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop_event: asyncio.Event | None = None
        self._state = AutoSignState()
        self._lock = asyncio.Lock()

    def status(self) -> AutoSignState:
        return self._state.snapshot()

    async def start(
        self,
        account_ids: list[int],
        interval_min: float,
        interval_max: float,
        account_interval_min: float,
        account_interval_max: float,
    ) -> AutoSignState:
        async with self._lock:
            if self._task is not None and not self._task.done():
                raise RuntimeError("自动签到正在运行")
            from app.services.post_tasks import post_task_manager

            if post_task_manager.status().running:
                raise RuntimeError("发帖任务正在运行，暂不能启动自动签到")
            self._stop_event = asyncio.Event()
            self._state = AutoSignState(
                running=True,
                started_at=local_now(),
                message="准备中",
            )
            self._task = asyncio.create_task(
                self._run(
                    account_ids,
                    interval_min,
                    interval_max,
                    account_interval_min,
                    account_interval_max,
                )
            )
        return self.status()

    async def stop(self) -> AutoSignState:
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
            await asyncio.wait_for(self._task, timeout=5)
        except Exception:  # noqa: BLE001
            self._task.cancel()

    def _add_error(self, message: str) -> None:
        if len(self._state.recent_errors) < 10:
            self._state.recent_errors.append(message)

    async def _run(
        self,
        account_ids: list[int],
        interval_min: float,
        interval_max: float,
        account_interval_min: float,
        account_interval_max: float,
    ) -> None:
        stop = self._stop_event
        try:
            with SessionLocal() as db:
                stmt = select(Account).order_by(Account.id)
                if account_ids:
                    stmt = stmt.where(Account.id.in_(account_ids))
                accounts = [
                    account
                    for account in db.scalars(stmt).all()
                    if account.bduss and account.status == "valid"
                ]

            self._state.account_total = len(accounts)
            if not accounts:
                self._state.message = "没有可用账号"
                return

            for index, snapshot in enumerate(accounts):
                if stop is not None and stop.is_set():
                    break
                self._state.current_account_id = snapshot.id
                self._state.current_account_name = (
                    snapshot.nickname or snapshot.username
                )
                self._state.account_index = index + 1
                self._state.current_forum = ""
                self._state.forum_index = 0
                self._state.forum_total = 0
                self._state.message = "签到中"

                with SessionLocal() as db:
                    account = db.get(Account, snapshot.id)
                    if account is None or not account.bduss:
                        self._state.skipped += 1
                        continue
                    reset_daily(db, account.id)
                    links = account_links(db, account.id)
                    selected = [
                        link for link in links if not link.is_signed and not link.is_banned
                    ]
                    if not selected:
                        self._state.skipped += 1
                        self._state.message = "本账号没有待签到贴吧"
                        continue

                    self._state.forum_total = len(selected)
                    account_name = account.nickname or account.username
                    effective_proxy = resolve_account_proxy(db, account)

                    def on_result(
                        result: SignResult,
                        account_label: str = account_name,
                    ) -> None:
                        self._state.forum_index += 1
                        self._state.current_forum = result.fname
                        if result.success:
                            if result.already_signed:
                                self._state.already += 1
                            else:
                                self._state.success += 1
                        else:
                            self._state.failed += 1
                            self._add_error(
                                f"{account_label} / {result.fname}: {result.message}"
                            )

                    try:
                        results = await sign_forums_async(
                            account.bduss,
                            account.stoken or "",
                            [link.fname for link in selected],
                            interval_min=interval_min,
                            interval_max=interval_max,
                            stop_event=stop,
                            on_result=on_result,
                            proxy=effective_proxy.client_config if effective_proxy else None,
                        )
                    except Exception as exc:  # noqa: BLE001
                        self._state.failed += 1
                        self._add_error(
                            f"{account_name}: {type(exc).__name__}: {exc}"
                        )
                    else:
                        apply_sign_results(db, account, selected, results, local_now())
                        db.commit()

                if stop is not None and stop.is_set():
                    break
                if index < len(accounts) - 1:
                    delay = random.uniform(
                        account_interval_min,
                        max(account_interval_max, account_interval_min),
                    )
                    if stop is not None:
                        try:
                            await asyncio.wait_for(stop.wait(), timeout=delay)
                            break
                        except TimeoutError:
                            pass
                    else:
                        await asyncio.sleep(delay)

            self._state.message = (
                "已停止" if stop is not None and stop.is_set() else "全部完成"
            )
        except Exception as exc:  # noqa: BLE001
            self._state.message = f"失败：{exc}"
            self._add_error(f"{type(exc).__name__}: {exc}")
        finally:
            self._state.running = False
            self._state.finished_at = local_now()
            self._state.current_forum = ""
            if self._stop_event is not None:
                self._stop_event.clear()


def get_or_create_settings(db: Session) -> AutoSignSetting:
    settings = db.get(AutoSignSetting, 1)
    if settings is None:
        settings = AutoSignSetting(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


auto_sign_manager = AutoSignManager()


def is_auto_sign_due(
    *,
    enabled: bool,
    schedule_time: str,
    last_run_date: date | None,
    now: datetime,
) -> bool:
    return (
        enabled
        and now.strftime("%H:%M") >= schedule_time
        and last_run_date != now.date()
    )


async def scheduler_loop() -> None:
    await asyncio.sleep(5)
    while True:
        try:
            with SessionLocal() as db:
                settings = get_or_create_settings(db)
                now = local_now()
                should_run = is_auto_sign_due(
                    enabled=settings.enabled,
                    schedule_time=settings.schedule_time,
                    last_run_date=settings.last_run_date,
                    now=now,
                )
                if should_run and not auto_sign_manager.status().running:
                    state = await auto_sign_manager.start(
                        list(settings.account_ids or []),
                        settings.interval_min,
                        settings.interval_max,
                        settings.account_interval_min,
                        settings.account_interval_max,
                    )
                    if state.running:
                        settings.last_run_date = now.date()
                        db.commit()
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(20)
