import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import get_settings
from app.services.auto_sign import auto_sign_manager, scheduler_loop
from app.services.post_tasks import post_task_manager, post_task_scheduler_loop

settings = get_settings()
UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
(UPLOAD_ROOT / "materials").mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    scheduler_task = asyncio.create_task(scheduler_loop())
    post_scheduler_task = asyncio.create_task(post_task_scheduler_loop())
    try:
        yield
    finally:
        scheduler_task.cancel()
        post_scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler_task
        with suppress(asyncio.CancelledError):
            await post_scheduler_task
        await auto_sign_manager.shutdown()
        await post_task_manager.shutdown()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}


app.include_router(api_router, prefix=settings.api_v1_prefix)
