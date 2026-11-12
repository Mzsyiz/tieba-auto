from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SignItemRead(BaseModel):
    forum_id: int
    fname: str
    level: int
    is_followed: bool
    is_banned: bool
    ban_reason: str | None
    is_signed: bool
    last_sign_status: str
    last_sign_at: datetime | None
    sign_count: int
    history_success: int
    history_failed: int
    sign_error: str | None


class SignStats(BaseModel):
    total: int
    signed: int
    pending: int
    failed: int
    banned: int


class SignOverviewResponse(BaseModel):
    items: list[SignItemRead]
    total: int
    stats: SignStats


class SignRequest(BaseModel):
    forum_ids: list[int] | None = Field(
        default=None,
        max_length=200,
        description="为空时签到当前账号所有未签到且未封禁的贴吧",
    )


class SignItemResult(BaseModel):
    forum_id: int
    fname: str
    success: bool
    already_signed: bool
    status: str
    message: str


class SignRunResult(BaseModel):
    success: int
    already: int
    failed: int
    items: list[SignItemResult]


class SignLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    forum_id: int
    fname: str
    status: str
    success: bool
    message: str
    signed_at: datetime


class SignLogListResponse(BaseModel):
    items: list[SignLogRead]
