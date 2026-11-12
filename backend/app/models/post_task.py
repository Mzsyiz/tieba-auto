from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class PostTask(Base, TimestampMixin):
    __tablename__ = "post_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    forum_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    material_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    strategy: Mapped[str] = mapped_column(String(20), default="round_robin", nullable=False)
    interval_min: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    interval_max: Mapped[float] = mapped_column(Float, default=30.0, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)


class PostTaskLog(Base):
    __tablename__ = "post_task_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("post_tasks.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    account_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    account_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    forum_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fname: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    material_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    tid: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
        nullable=False,
    )
