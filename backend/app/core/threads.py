"""当前账号主题帖的读取与删除。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime

from aiotieba.config import ProxyConfig


@dataclass(frozen=True)
class OwnThread:
    fid: int
    fname: str
    tid: int
    pid: int
    title: str
    content: str
    image_urls: list[str]
    video_url: str
    view_num: int
    reply_num: int
    agree_num: int
    created_at: datetime


async def _list_own_threads_async(
    bduss: str,
    stoken: str,
    page: int,
    proxy: ProxyConfig | None = None,
) -> list[OwnThread]:
    from aiotieba import Account, Client

    account = Account(BDUSS=bduss, STOKEN=stoken)
    async with Client(
        account=account,
        proxy=proxy if proxy is not None else False,
    ) as client:
        result = await client.get_self_threads(page, public_only=False)

    if result.err:
        raise RuntimeError(str(result.err))

    threads: list[OwnThread] = []
    for thread in result.objs:
        contents = thread.contents
        image_urls = list(
            dict.fromkeys(
                image.origin_src or image.big_src or image.src
                for image in contents.imgs
                if image.origin_src or image.big_src or image.src
            )
        )
        video = contents.video
        created_at = (
            datetime.fromtimestamp(thread.create_time, tz=UTC)
            if thread.create_time > 0
            else datetime.now(UTC)
        )
        threads.append(
            OwnThread(
                fid=thread.fid,
                fname=thread.fname,
                tid=thread.tid,
                pid=thread.pid,
                title=thread.title,
                content=contents.text,
                image_urls=image_urls,
                video_url=video.src if video else "",
                view_num=thread.view_num,
                reply_num=thread.reply_num,
                agree_num=thread.agree,
                created_at=created_at,
            )
        )
    return threads


def list_own_threads(
    bduss: str,
    stoken: str = "",
    *,
    page: int = 1,
    timeout: float = 30.0,
    proxy: ProxyConfig | None = None,
) -> list[OwnThread]:
    """读取当前账号发布的主题帖，按贴吧接口原顺序返回。"""
    try:
        return asyncio.run(
            asyncio.wait_for(
                _list_own_threads_async(bduss, stoken, page, proxy),
                timeout=timeout,
            )
        )
    except TimeoutError as exc:
        raise TimeoutError("帖子列表加载超时，请稍后重试") from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"{type(exc).__name__}: {exc}") from exc


async def _delete_own_thread_async(
    bduss: str,
    stoken: str,
    fname: str,
    tid: int,
    proxy: ProxyConfig | None = None,
) -> None:
    from aiotieba import Account, Client

    account = Account(BDUSS=bduss, STOKEN=stoken)
    async with Client(
        account=account,
        proxy=proxy if proxy is not None else False,
    ) as client:
        result = await client.del_thread(fname, tid)
    if result.err:
        raise RuntimeError(str(result.err))


def delete_own_thread(
    bduss: str,
    stoken: str,
    fname: str,
    tid: int,
    timeout: float = 30.0,
    proxy: ProxyConfig | None = None,
) -> None:
    """使用帖子作者账号从贴吧服务器删除主题帖。"""
    try:
        asyncio.run(
            asyncio.wait_for(
                _delete_own_thread_async(bduss, stoken, fname, tid, proxy),
                timeout=timeout,
            )
        )
    except TimeoutError as exc:
        raise TimeoutError("删除帖子超时，请稍后重试") from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"{type(exc).__name__}: {exc}") from exc
