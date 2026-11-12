from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AppSettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    auto_sync_forums: bool
    default_proxy_id: int | None
    proxy_auto_disable: bool
    proxy_failure_threshold: int
    request_timeout_seconds: int
    follow_interval_min: float
    follow_interval_max: float
    sign_interval_min: float
    sign_interval_max: float
    post_interval_min: float
    post_interval_max: float
    post_prewarm_min: float
    post_prewarm_max: float
    max_task_total: int
    updated_at: datetime


class AppSettingUpdate(BaseModel):
    auto_sync_forums: bool
    default_proxy_id: int | None = None
    proxy_auto_disable: bool
    proxy_failure_threshold: int = Field(ge=1, le=100)
    request_timeout_seconds: int = Field(ge=5, le=180)
    follow_interval_min: float = Field(ge=0, le=3600)
    follow_interval_max: float = Field(ge=0, le=3600)
    sign_interval_min: float = Field(ge=0, le=3600)
    sign_interval_max: float = Field(ge=0, le=3600)
    post_interval_min: float = Field(ge=0, le=3600)
    post_interval_max: float = Field(ge=0, le=3600)
    post_prewarm_min: float = Field(ge=0, le=60)
    post_prewarm_max: float = Field(ge=0, le=60)
    max_task_total: int = Field(ge=1, le=5000)


class SystemInfo(BaseModel):
    app_name: str
    environment: str
    version: str
    account_count: int
    forum_count: int
    material_count: int
    proxy_count: int
    running_auto_sign: bool
    running_post_task: bool
