from datetime import datetime

from pydantic import BaseModel, Field


class AccountPostRead(BaseModel):
    fid: int
    fname: str
    tid: int
    pid: int
    title: str
    content: str
    image_urls: list[str]
    video_url: str | None
    view_num: int
    reply_num: int
    agree_num: int
    created_at: datetime
    url: str


class AccountPostListResponse(BaseModel):
    items: list[AccountPostRead]
    page: int
    page_size: int
    has_more: bool


class AccountPostDeleteRequest(BaseModel):
    account_id: int
    tid: int = Field(gt=0)
    fname: str = Field(min_length=1, max_length=100)


class AccountPostDeleteResponse(BaseModel):
    success: bool
    message: str
