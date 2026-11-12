from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AccountStatus(StrEnum):
    VALID = "valid"
    PENDING = "pending"
    INVALID = "invalid"
    DISABLED = "disabled"


class Account(Base, TimestampMixin):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # 百度贴吧登录凭据，敏感字段，不随列表接口返回
    bduss: Mapped[str | None] = mapped_column(Text, nullable=True)
    stoken: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20),
        default=AccountStatus.PENDING.value,
        nullable=False,
    )
    status_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tieba_uid: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    portrait: Mapped[str | None] = mapped_column(String(255), nullable=True)
    proxy_id: Mapped[int | None] = mapped_column(
        ForeignKey("proxy_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def has_credentials(self) -> bool:
        return bool(self.bduss or self.stoken)

    @property
    def avatar_url(self) -> str | None:
        if not self.portrait:
            return None
        if self.portrait.startswith("http"):
            return self.portrait
        return f"https://himg.bdimg.com/sys/portrait/item/{self.portrait}"
