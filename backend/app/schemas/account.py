from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.account import AccountStatus


class AccountBase(BaseModel):
    username: str = Field(min_length=1, max_length=255, description="登录用户名/手机号/邮箱")
    nickname: str | None = Field(default=None, max_length=255, description="贴吧昵称")
    status: AccountStatus = AccountStatus.PENDING
    status_reason: str | None = Field(default=None, max_length=500)
    notes: str | None = None


class AccountCreate(AccountBase):
    bduss: str | None = Field(default=None, description="百度贴吧 BDUSS 凭据")
    stoken: str | None = Field(default=None, description="百度贴吧 STOKEN 凭据")
    proxy_id: int | None = None


class AccountUpdate(BaseModel):
    nickname: str | None = Field(default=None, max_length=255)
    bduss: str | None = None
    stoken: str | None = None
    status: AccountStatus | None = None
    status_reason: str | None = Field(default=None, max_length=500)
    notes: str | None = None
    proxy_id: int | None = None


class CookieImportRequest(BaseModel):
    cookie: str | None = Field(
        default=None,
        description="完整 Cookie 字符串（自动提取 BDUSS/STOKEN），也可只传 BDUSS",
    )
    bduss: str | None = Field(default=None, description="手动指定 BDUSS")
    stoken: str | None = Field(default=None, description="手动指定 STOKEN")
    name: str | None = Field(default=None, max_length=255, description="账号备注/显示名")
    verify: bool = Field(default=True, description="是否调用百度接口验证并自动获取昵称")
    status: AccountStatus | None = Field(default=None, description="跳过验证时手动指定状态")
    proxy_id: int | None = None


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    nickname: str | None
    status: AccountStatus
    status_reason: str | None
    last_login_at: datetime | None
    tieba_uid: int | None
    avatar_url: str | None
    proxy_id: int | None
    notes: str | None
    has_credentials: bool
    created_at: datetime
    updated_at: datetime
