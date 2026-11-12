from sqlalchemy import Boolean, Float, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AppSetting(Base, TimestampMixin):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    auto_sync_forums: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    default_proxy_id: Mapped[int | None] = mapped_column(
        ForeignKey("proxy_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    proxy_auto_disable: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    proxy_failure_threshold: Mapped[int] = mapped_column(
        Integer,
        default=3,
        nullable=False,
    )
    request_timeout_seconds: Mapped[int] = mapped_column(
        Integer,
        default=30,
        nullable=False,
    )
    follow_interval_min: Mapped[float] = mapped_column(
        Float,
        default=2.0,
        nullable=False,
    )
    follow_interval_max: Mapped[float] = mapped_column(
        Float,
        default=5.0,
        nullable=False,
    )
    sign_interval_min: Mapped[float] = mapped_column(
        Float,
        default=1.0,
        nullable=False,
    )
    sign_interval_max: Mapped[float] = mapped_column(
        Float,
        default=3.0,
        nullable=False,
    )
    post_interval_min: Mapped[float] = mapped_column(
        Float,
        default=10.0,
        nullable=False,
    )
    post_interval_max: Mapped[float] = mapped_column(
        Float,
        default=30.0,
        nullable=False,
    )
    post_prewarm_min: Mapped[float] = mapped_column(
        Float,
        default=1.2,
        nullable=False,
    )
    post_prewarm_max: Mapped[float] = mapped_column(
        Float,
        default=3.5,
        nullable=False,
    )
    max_task_total: Mapped[int] = mapped_column(
        Integer,
        default=100,
        nullable=False,
    )
