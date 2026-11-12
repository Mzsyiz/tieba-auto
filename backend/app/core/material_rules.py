"""贴吧发帖素材的输入规则。"""

from __future__ import annotations

POST_CONTENT_TYPE = "post"
VIDEO_CONTENT_TYPE = "video"

POST_TITLE_MIN = 5
POST_TITLE_MAX = 31
VIDEO_TITLE_MIN = 5
VIDEO_TITLE_MAX = 60
CONTENT_MAX = 2000
POST_IMAGE_MAX = 10
VIDEO_MAX = 1


def validate_material_input(
    *,
    post_type: str,
    title: str,
    content: str,
    image_urls: list[str],
    video_urls: list[str],
) -> str | None:
    """返回首个用户可读的校验错误；None 表示通过。"""
    title_length = len(title)
    content_length = len(content)

    if post_type == POST_CONTENT_TYPE:
        if not POST_TITLE_MIN <= title_length <= POST_TITLE_MAX:
            return f"普通帖标题需为 {POST_TITLE_MIN}-{POST_TITLE_MAX} 字"
        if not content:
            return "普通帖正文不能为空"
        if content_length > CONTENT_MAX:
            return f"正文不能超过 {CONTENT_MAX} 字"
        if len(image_urls) > POST_IMAGE_MAX:
            return f"普通帖最多添加 {POST_IMAGE_MAX} 张图片"
        if video_urls:
            return "普通帖和视频帖是两种独立素材，普通帖不能包含视频"
        return None

    if post_type == VIDEO_CONTENT_TYPE:
        if not VIDEO_TITLE_MIN <= title_length <= VIDEO_TITLE_MAX:
            return f"视频帖标题需为 {VIDEO_TITLE_MIN}-{VIDEO_TITLE_MAX} 字"
        if content_length > CONTENT_MAX:
            return f"视频简介不能超过 {CONTENT_MAX} 字"
        if image_urls:
            return "视频帖不能同时包含图片"
        if len(video_urls) != VIDEO_MAX:
            return "视频帖必须且只能包含 1 个视频"
        return None

    return "不支持的素材类型"
