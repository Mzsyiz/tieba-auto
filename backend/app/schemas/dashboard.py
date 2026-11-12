from datetime import datetime

from pydantic import BaseModel


class DashboardOverview(BaseModel):
    account_total: int
    account_valid: int
    account_with_credentials: int
    followed_forums: int
    manual_forums: int
    material_total: int
    material_video: int
    proxy_total: int
    proxy_active: int
    proxy_online: int


class DashboardTaskStats(BaseModel):
    total: int
    pending: int
    running: int
    completed: int
    failed: int
    stopped: int
    jobs_total: int
    jobs_success: int
    jobs_failed: int


class DashboardSignStats(BaseModel):
    today_total: int
    success: int
    already: int
    failed: int
    seven_day_success: int
    seven_day_failed: int


class DashboardRunnerStatus(BaseModel):
    auto_sign_running: bool
    auto_sign_message: str
    post_task_running: bool
    post_task_message: str


class DashboardRecentTask(BaseModel):
    id: int
    name: str
    status: str
    total: int
    completed: int
    success: int
    failed: int
    scheduled_at: datetime | None
    created_at: datetime


class DashboardRecentSign(BaseModel):
    id: int
    account_name: str
    fname: str
    status: str
    message: str
    signed_at: datetime


class DashboardRecentPostFailure(BaseModel):
    id: int
    account_name: str
    fname: str
    title: str
    message: str
    created_at: datetime


class DashboardResponse(BaseModel):
    overview: DashboardOverview
    tasks: DashboardTaskStats
    signs: DashboardSignStats
    runners: DashboardRunnerStatus
    recent_tasks: list[DashboardRecentTask]
    recent_signs: list[DashboardRecentSign]
    recent_post_failures: list[DashboardRecentPostFailure]
    generated_at: datetime
