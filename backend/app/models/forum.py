from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.account import Account


class Forum(Base, TimestampMixin):
    __tablename__ = "forums"

    id: Mapped[int] = mapped_column(primary_key=True)
    fid: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    fname: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[str] = mapped_column(
        String(20),
        default="manual",
        nullable=False,
        comment="manual=手动吧池, account=账号关注同步",
    )

    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    account: Mapped["Account | None"] = relationship("Account", lazy="joined")

    is_post_target: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ban_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def account_name(self) -> str | None:
        if self.account is None:
            return None
        return self.account.nickname or self.account.username
