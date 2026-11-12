from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MaterialStatus = Literal["available", "used", "disabled"]
MaterialPostType = Literal["post", "video"]


class MaterialCreate(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    content: str = Field(default="", max_length=2000)
    post_type: MaterialPostType = "post"
    image_urls: list[str] = Field(default_factory=list, max_length=10)
    video_urls: list[str] = Field(default_factory=list, max_length=1)
    tags: list[str] = Field(default_factory=list, max_length=10)
    status: MaterialStatus = "available"
    notes: str | None = None


class MaterialUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=60)
    content: str | None = Field(default=None, max_length=2000)
    post_type: MaterialPostType | None = None
    image_urls: list[str] | None = Field(default=None, max_length=10)
    video_urls: list[str] | None = Field(default=None, max_length=1)
    tags: list[str] | None = Field(default=None, max_length=10)
    status: MaterialStatus | None = None
    notes: str | None = None


class MaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    post_type: MaterialPostType
    image_urls: list[str]
    video_urls: list[str]
    tags: list[str]
    status: MaterialStatus
    usage_count: int
    last_used_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class MaterialStats(BaseModel):
    total: int
    available: int
    used: int
    disabled: int


class MaterialListResponse(BaseModel):
    items: list[MaterialRead]
    total: int
    stats: MaterialStats


class MaterialUploadResponse(BaseModel):
    url: str
