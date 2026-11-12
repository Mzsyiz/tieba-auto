from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PostTaskStatus = Literal["pending", "running", "completed", "failed", "stopped"]


class PostTaskCreate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    account_ids: list[int] = Field(min_length=1, max_length=20)
    forum_ids: list[int] = Field(min_length=1, max_length=50)
    material_ids: list[int] = Field(min_length=1, max_length=50)
    interval_min: float = Field(default=10, ge=0, le=3600)
    interval_max: float = Field(default=30, ge=0, le=3600)
    scheduled_at: datetime | None = None


class PostTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    account_ids: list[int]
    forum_ids: list[int]
    material_ids: list[int]
    strategy: str
    interval_min: float
    interval_max: float
    scheduled_at: datetime | None
    status: PostTaskStatus
    total: int
    completed: int
    success: int
    failed: int
    started_at: datetime | None
    finished_at: datetime | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class PostTaskLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int | None
    account_name: str
    forum_id: int | None
    fname: str
    material_id: int | None
    title: str
    status: str
    tid: int | None
    message: str
    created_at: datetime


class PostTaskStats(BaseModel):
    pending: int
    running: int
    completed: int
    failed: int
    stopped: int


class PostTaskListResponse(BaseModel):
    items: list[PostTaskRead]
    stats: PostTaskStats


class PostTaskDetailResponse(BaseModel):
    task: PostTaskRead
    logs: list[PostTaskLogRead]


class PostTaskManagerStatus(BaseModel):
    running: bool
    current_task_id: int | None
    message: str
