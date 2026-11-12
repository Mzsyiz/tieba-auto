from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.core.threads import delete_own_thread, list_own_threads
from app.models.account import Account
from app.schemas.account_post import (
    AccountPostDeleteRequest,
    AccountPostDeleteResponse,
    AccountPostListResponse,
    AccountPostRead,
)
from app.services.proxy_service import resolve_account_proxy

router = APIRouter(prefix="/account-posts", tags=["account-posts"])

PAGE_SIZE = 20


def _get_account(account_id: int, db: Session) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    if not account.bduss:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该账号未配置 BDUSS，无法读取帖子",
        )
    return account


@router.get("", response_model=AccountPostListResponse)
def get_account_posts(
    account_id: Annotated[int, Query(gt=0)],
    db: DbSession,
    page: Annotated[int, Query(ge=1, le=500)] = 1,
) -> AccountPostListResponse:
    account = _get_account(account_id, db)
    effective_proxy = resolve_account_proxy(db, account)
    try:
        threads = list_own_threads(
            account.bduss or "",
            account.stoken or "",
            page=page,
            proxy=effective_proxy.client_config if effective_proxy else None,
        )
    except TimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"读取帖子失败：{exc}",
        ) from exc

    items = [
        AccountPostRead(
            fid=thread.fid,
            fname=thread.fname,
            tid=thread.tid,
            pid=thread.pid,
            title=thread.title,
            content=thread.content,
            image_urls=thread.image_urls,
            video_url=thread.video_url or None,
            view_num=thread.view_num,
            reply_num=thread.reply_num,
            agree_num=thread.agree_num,
            created_at=thread.created_at,
            url=(
                f"https://tieba.baidu.com/p/{thread.tid}"
                f"?fid={thread.fid}&kw={quote(thread.fname)}"
            ),
        )
        for thread in threads
    ]
    return AccountPostListResponse(
        items=items,
        page=page,
        page_size=PAGE_SIZE,
        has_more=len(threads) >= PAGE_SIZE,
    )


@router.post("/delete", response_model=AccountPostDeleteResponse)
def delete_account_post(
    payload: AccountPostDeleteRequest,
    db: DbSession,
) -> AccountPostDeleteResponse:
    account = _get_account(payload.account_id, db)
    effective_proxy = resolve_account_proxy(db, account)
    try:
        delete_own_thread(
            account.bduss or "",
            account.stoken or "",
            payload.fname,
            payload.tid,
            proxy=effective_proxy.client_config if effective_proxy else None,
        )
    except TimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"删除失败：{exc}",
        ) from exc
    return AccountPostDeleteResponse(success=True, message="帖子已从贴吧服务器删除")
