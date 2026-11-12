from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ForumCreateRequest(BaseModel):
    names: str = Field(
        min_length=1,
        description="贴吧名，多个可用换行、逗号或空格分隔",
    )
    account_id: int | None = None
    is_post_target: bool = False
    notes: str | None = None


class ForumUpdate(BaseModel):
    notes: str | None = None
    is_post_target: bool | None = None
    is_banned: bool | None = None
    ban_reason: str | None = Field(default=None, max_length=500)
    level: int | None = Field(default=None, ge=0)


class ForumRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fid: int | None
    fname: str
    level: int
    source: str
    account_id: int | None
    account_name: str | None
    is_post_target: bool
    is_banned: bool
    ban_reason: str | None
    notes: str | None
    last_synced_at: datetime | None
    followed_by_account: bool | None = None
    created_at: datetime
    updated_at: datetime


class ForumStats(BaseModel):
    total: int
    active: int
    banned: int
    post_targets: int


class ForumListResponse(BaseModel):
    items: list[ForumRead]
    total: int
    stats: ForumStats


class ForumBulkCreateResult(BaseModel):
    added: int
    promoted: int
    existing: int
    items: list[ForumRead]


class ForumPoolImportRequest(BaseModel):
    forum_ids: list[int] = Field(min_length=1, max_length=200)


class ForumPoolImportResult(BaseModel):
    promoted: int
    existing: int
    items: list[ForumRead]


class ForumSyncRequest(BaseModel):
    account_id: int


class ForumSyncResult(BaseModel):
    fetched: int
    added: int
    updated: int
    skipped: int
    account_name: str


class AccountForumRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    forum_id: int
    fid: int | None
    fname: str
    level: int
    is_followed: bool
    is_banned: bool
    ban_reason: str | None
    is_signed: bool
    hot_num: int
    member_count: int
    today_thread_num: int
    thread_num: int
    last_synced_at: datetime | None
    follow_error: str | None
    is_post_target: bool
    notes: str | None


class AccountForumStats(BaseModel):
    total: int
    followed: int
    banned: int
    signed: int


class AccountForumListResponse(BaseModel):
    items: list[AccountForumRead]
    total: int
    stats: AccountForumStats


class ForumFollowRequest(BaseModel):
    account_id: int
    forum_ids: list[int] = Field(min_length=1, max_length=100)


class ForumFollowItem(BaseModel):
    forum_id: int
    fname: str
    success: bool
    message: str


class ForumFollowResult(BaseModel):
    success: int
    failed: int
    items: list[ForumFollowItem]
