from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.core.config import get_settings
from app.models.account import Account
from app.models.forum import Forum
from app.models.material import Material
from app.models.proxy import ProxyNode
from app.schemas.app_setting import AppSettingRead, AppSettingUpdate, SystemInfo
from app.services.app_settings import get_or_create_app_settings, validate_settings
from app.services.auto_sign import auto_sign_manager
from app.services.post_tasks import post_task_manager

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettingRead)
def get_app_settings(db: DbSession) -> AppSettingRead:
    return AppSettingRead.model_validate(get_or_create_app_settings(db))


@router.put("", response_model=AppSettingRead)
def update_app_settings(payload: AppSettingUpdate, db: DbSession) -> AppSettingRead:
    error = validate_settings(payload)
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    if payload.default_proxy_id is not None:
        proxy = db.get(ProxyNode, payload.default_proxy_id)
        if proxy is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="默认代理不存在",
            )
        if not proxy.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="默认代理当前未启用",
            )

    settings = get_or_create_app_settings(db)
    for field, value in payload.model_dump().items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return AppSettingRead.model_validate(settings)


@router.get("/system", response_model=SystemInfo)
def get_system_info(db: DbSession) -> SystemInfo:
    runtime = get_settings()
    return SystemInfo(
        app_name=runtime.app_name,
        environment=runtime.environment,
        version="0.1.0",
        account_count=db.scalar(select(func.count(Account.id))) or 0,
        forum_count=db.scalar(select(func.count(Forum.id))) or 0,
        material_count=db.scalar(select(func.count(Material.id))) or 0,
        proxy_count=db.scalar(select(func.count(ProxyNode.id))) or 0,
        running_auto_sign=auto_sign_manager.status().running,
        running_post_task=post_task_manager.status().running,
    )
