from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.account import Account
    from app.models.forum import Forum


class AccountForum(Base, TimestampMixin):
    """账号与贴吧的关注关系及该账号视角的状态。"""

    __tablename__ = "account_forums"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    forum_id: Mapped[int] = mapped_column(
        ForeignKey("forums.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_followed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ban_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_signed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_sign_status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )
    last_sign_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sign_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    history_success: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    history_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sign_error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    hot_num: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    member_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    today_thread_num: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    thread_num: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    follow_error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    account: Mapped["Account"] = relationship("Account", lazy="joined")
    forum: Mapped["Forum"] = relationship("Forum", lazy="joined")

    __table_args__ = (UniqueConstraint("account_id", "forum_id", name="uq_account_forum"),)

    @property
    def fname(self) -> str:
        return self.forum.fname

    @property
    def fid(self) -> int | None:
        return self.forum.fid

    @property
    def is_post_target(self) -> bool:
        return self.forum.is_post_target

    @property
    def notes(self) -> str | None:
        return self.forum.notes
