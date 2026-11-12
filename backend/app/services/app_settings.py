from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.app_setting import AppSetting
from app.schemas.app_setting import AppSettingUpdate


def get_or_create_app_settings(db: Session) -> AppSetting:
    settings = db.get(AppSetting, 1)
    if settings is None:
        settings = AppSetting(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def validate_settings(payload: AppSettingUpdate) -> str | None:
    ranges = [
        ("关注间隔", payload.follow_interval_min, payload.follow_interval_max),
        ("签到间隔", payload.sign_interval_min, payload.sign_interval_max),
        ("发帖间隔", payload.post_interval_min, payload.post_interval_max),
        ("发帖预热", payload.post_prewarm_min, payload.post_prewarm_max),
    ]
    for label, minimum, maximum in ranges:
        if minimum > maximum:
            return f"{label}最小值不能大于最大值"
    return None
