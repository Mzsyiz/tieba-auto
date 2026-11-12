import uuid
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.core.material_rules import (
    POST_IMAGE_MAX,
    VIDEO_MAX,
    validate_material_input,
)
from app.models.material import Material
from app.schemas.material import (
    MaterialCreate,
    MaterialListResponse,
    MaterialRead,
    MaterialStats,
    MaterialUpdate,
    MaterialUploadResponse,
)

router = APIRouter(prefix="/materials", tags=["materials"])

UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "materials"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 500 * 1024 * 1024
IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
VIDEO_EXTENSIONS = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
}


def _normalize_tags(tags: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        tag = raw.strip()[:30]
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(tag)
        if len(result) >= 10:
            break
    return result


def _normalize_urls(urls: list[str], limit: int = 10) -> list[str]:
    result: list[str] = []
    for raw in urls:
        url = raw.strip()
        if url and url not in result:
            result.append(url)
        if len(result) >= limit:
            break
    return result


def _stats(db: Session) -> MaterialStats:
    total = db.scalar(select(func.count(Material.id))) or 0
    available = (
        db.scalar(
            select(func.count(Material.id)).where(Material.status == "available")
        )
        or 0
    )
    used = (
        db.scalar(select(func.count(Material.id)).where(Material.status == "used")) or 0
    )
    disabled = (
        db.scalar(
            select(func.count(Material.id)).where(Material.status == "disabled")
        )
        or 0
    )
    return MaterialStats(
        total=total,
        available=available,
        used=used,
        disabled=disabled,
    )


def _cleanup_unused_media(db: Session, material_id: int, urls: list[str]) -> None:
    if not urls:
        return
    others = list(db.scalars(select(Material).where(Material.id != material_id)).all())
    used = {
        url
        for material in others
        for url in [*(material.image_urls or []), *(material.video_urls or [])]
    }
    for url in urls:
        if not url.startswith("/uploads/materials/") or url in used:
            continue
        path = UPLOAD_DIR / url.rsplit("/", 1)[-1]
        with suppress(OSError):
            path.unlink(missing_ok=True)


@router.get("", response_model=MaterialListResponse)
def list_materials(
    db: DbSession,
    q: Annotated[str | None, Query(max_length=255)] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> MaterialListResponse:
    stmt = select(Material).order_by(Material.created_at.desc(), Material.id.desc())
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Material.title.ilike(like),
                Material.content.ilike(like),
                Material.notes.ilike(like),
            )
        )
    if status_filter in {"available", "used", "disabled"}:
        stmt = stmt.where(Material.status == status_filter)
    items = list(db.scalars(stmt).all())
    return MaterialListResponse(
        items=[MaterialRead.model_validate(item) for item in items],
        total=len(items),
        stats=_stats(db),
    )


@router.post("", response_model=MaterialRead, status_code=status.HTTP_201_CREATED)
def create_material(payload: MaterialCreate, db: DbSession) -> Material:
    title = payload.title.strip()
    content = payload.content.strip()
    image_urls = _normalize_urls(payload.image_urls, limit=POST_IMAGE_MAX)
    video_urls = _normalize_urls(payload.video_urls, limit=VIDEO_MAX)
    error = validate_material_input(
        post_type=payload.post_type,
        title=title,
        content=content,
        image_urls=image_urls,
        video_urls=video_urls,
    )
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    material = Material(
        title=title,
        content=content,
        post_type=payload.post_type,
        image_urls=image_urls,
        video_urls=video_urls,
        tags=_normalize_tags(payload.tags),
        status=payload.status,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


@router.patch("/{material_id}", response_model=MaterialRead)
def update_material(
    material_id: int,
    payload: MaterialUpdate,
    db: DbSession,
) -> Material:
    material = db.get(Material, material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="素材不存在")
    old_images = list(material.image_urls or [])
    old_videos = list(material.video_urls or [])
    changes = payload.model_dump(exclude_unset=True)
    if "image_urls" in changes and changes["image_urls"] is not None:
        changes["image_urls"] = _normalize_urls(changes["image_urls"], limit=POST_IMAGE_MAX)
    if "video_urls" in changes and changes["video_urls"] is not None:
        changes["video_urls"] = _normalize_urls(changes["video_urls"], limit=VIDEO_MAX)
    if "tags" in changes and changes["tags"] is not None:
        changes["tags"] = _normalize_tags(changes["tags"])
    if "title" in changes and changes["title"] is not None:
        changes["title"] = changes["title"].strip()
    if "content" in changes and changes["content"] is not None:
        changes["content"] = changes["content"].strip()
    if "notes" in changes:
        changes["notes"] = (changes["notes"] or "").strip() or None
    for field, value in changes.items():
        setattr(material, field, value)
    error = validate_material_input(
        post_type=material.post_type,
        title=material.title,
        content=material.content,
        image_urls=list(material.image_urls or []),
        video_urls=list(material.video_urls or []),
    )
    if error:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    db.commit()
    db.refresh(material)
    if "image_urls" in changes:
        removed = [url for url in old_images if url not in (material.image_urls or [])]
        _cleanup_unused_media(db, material.id, removed)
    if "video_urls" in changes:
        removed = [url for url in old_videos if url not in (material.video_urls or [])]
        _cleanup_unused_media(db, material.id, removed)
    return material


@router.post("/{material_id}/use", response_model=MaterialRead)
def use_material(material_id: int, db: DbSession) -> Material:
    material = db.get(Material, material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="素材不存在")
    material.usage_count += 1
    material.last_used_at = datetime.now(UTC)
    material.status = "used"
    db.commit()
    db.refresh(material)
    return material


@router.post("/upload", response_model=MaterialUploadResponse)
async def upload_material_image(
    file: Annotated[UploadFile, File()],
) -> MaterialUploadResponse:
    extension = IMAGE_EXTENSIONS.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 JPG、PNG、WebP、GIF 图片",
        )
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="图片不能超过 10MB",
        )
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    (UPLOAD_DIR / filename).write_bytes(content)
    return MaterialUploadResponse(url=f"/uploads/materials/{filename}")


@router.post("/upload-video", response_model=MaterialUploadResponse)
async def upload_material_video(
    file: Annotated[UploadFile, File()],
) -> MaterialUploadResponse:
    extension = VIDEO_EXTENSIONS.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 MP4、WebM、MOV 视频",
        )
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    path = UPLOAD_DIR / filename
    size = 0
    try:
        with path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_VIDEO_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="视频不能超过 500MB",
                    )
                output.write(chunk)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return MaterialUploadResponse(url=f"/uploads/materials/{filename}")


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(material_id: int, db: DbSession) -> None:
    material = db.get(Material, material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="素材不存在")
    images = [*(material.image_urls or []), *(material.video_urls or [])]
    db.delete(material)
    db.commit()
    _cleanup_unused_media(db, material_id, images)
