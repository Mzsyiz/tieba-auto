from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ProxyProtocol = Literal["http", "https"]


class ProxyBoundAccount(BaseModel):
    id: int
    name: str


class ProxyCreate(BaseModel):
    name: str = Field(default="", max_length=100)
    protocol: ProxyProtocol = "http"
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=1000)
    is_active: bool = True


class ProxyUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    protocol: ProxyProtocol | None = None
    host: str | None = Field(default=None, min_length=1, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class ProxyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    display_name: str
    protocol: ProxyProtocol
    host: str
    port: int
    has_auth: bool
    is_active: bool
    fail_count: int
    success_count: int
    latency_ms: int | None
    last_checked_at: datetime | None
    last_error: str | None
    bound_accounts: list[ProxyBoundAccount]
    created_at: datetime
    updated_at: datetime


class ProxyStats(BaseModel):
    total: int
    active: int
    online: int
    failed: int
    bound_accounts: int


class ProxyListResponse(BaseModel):
    items: list[ProxyRead]
    total: int
    stats: ProxyStats


class ProxyBulkImportRequest(BaseModel):
    raw: str = Field(min_length=1, description="每行一个代理，支持 URL 或 host:port:user:pass")


class ProxyBulkImportResult(BaseModel):
    added: int
    skipped: int
    errors: list[str]
    items: list[ProxyRead]


class ProxyTestResult(BaseModel):
    success: bool
    latency_ms: int | None
    message: str
    checked_at: datetime


class ProxyBindRequest(BaseModel):
    account_ids: list[int] = Field(default_factory=list, max_length=500)
