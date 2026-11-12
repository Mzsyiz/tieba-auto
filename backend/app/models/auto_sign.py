from datetime import date

from sqlalchemy import JSON, Boolean, Date, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AutoSignSetting(Base, TimestampMixin):
    __tablename__ = "auto_sign_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    schedule_time: Mapped[str] = mapped_column(String(5), default="08:00", nullable=False)
    interval_min: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    interval_max: Mapped[float] = mapped_column(Float, default=3.0, nullable=False)
    account_interval_min: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)
    account_interval_max: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    account_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    last_run_date: Mapped[date | None] = mapped_column(Date, nullable=True)
