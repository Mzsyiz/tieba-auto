from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class AutoSignSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    enabled: bool
    schedule_time: str
    interval_min: float
    interval_max: float
    account_interval_min: float
    account_interval_max: float
    account_ids: list[int]
    last_run_date: date | None


class AutoSignSettingsUpdate(BaseModel):
    enabled: bool
    schedule_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    interval_min: float = Field(ge=0, le=120)
    interval_max: float = Field(ge=0, le=120)
    account_interval_min: float = Field(ge=0, le=300)
    account_interval_max: float = Field(ge=0, le=300)
    account_ids: list[int] = Field(default_factory=list, max_length=100)


class AutoSignStartRequest(BaseModel):
    account_ids: list[int] | None = Field(default=None, max_length=100)


class AutoSignStateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    running: bool
    started_at: datetime | None
    finished_at: datetime | None
    current_account_id: int | None
    current_account_name: str
    account_index: int
    account_total: int
    current_forum: str
    forum_index: int
    forum_total: int
    success: int
    already: int
    failed: int
    skipped: int
    message: str
    recent_errors: list[str]
