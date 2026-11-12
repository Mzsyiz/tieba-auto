from fastapi import APIRouter

from app.api.v1 import (
    account_posts,
    accounts,
    dashboard,
    forums,
    materials,
    post_tasks,
    proxies,
    settings,
    sign,
)

api_router = APIRouter()
api_router.include_router(accounts.router)
api_router.include_router(forums.router)
api_router.include_router(sign.router)
api_router.include_router(materials.router)
api_router.include_router(post_tasks.router)
api_router.include_router(account_posts.router)
api_router.include_router(proxies.router)
api_router.include_router(settings.router)
api_router.include_router(dashboard.router)
