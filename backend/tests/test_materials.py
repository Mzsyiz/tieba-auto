from pathlib import Path


def test_material_crud_search_and_use(client):
    created = client.post(
        "/api/v1/materials",
        json={
            "title": "传奇资源介绍",
            "content": "这是一条测试素材正文，包含传奇游戏资源说明。",
            "image_urls": ["/uploads/a.png", "/uploads/a.png"],
            "tags": ["传奇", "传奇", " 资源 "],
            "notes": "第一条素材",
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["tags"] == ["传奇", "资源"]
    assert body["image_urls"] == ["/uploads/a.png"]
    assert body["post_type"] == "post"
    assert body["video_urls"] == []
    assert body["status"] == "available"

    listed = client.get("/api/v1/materials", params={"q": "传奇资源"}).json()
    assert listed["total"] == 1
    assert listed["stats"] == {
        "total": 1,
        "available": 1,
        "used": 0,
        "disabled": 0,
    }

    updated = client.patch(
        f"/api/v1/materials/{body['id']}",
        json={"title": "更新后的素材", "status": "disabled", "notes": None},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "更新后的素材"
    assert updated.json()["status"] == "disabled"
    assert updated.json()["notes"] is None

    used = client.post(f"/api/v1/materials/{body['id']}/use")
    assert used.status_code == 200
    assert used.json()["usage_count"] == 1
    assert used.json()["status"] == "used"
    assert used.json()["last_used_at"] is not None

    filtered = client.get("/api/v1/materials", params={"status": "used"}).json()
    assert filtered["total"] == 1

    assert client.delete(f"/api/v1/materials/{body['id']}").status_code == 204
    assert client.get("/api/v1/materials").json()["total"] == 0


def test_material_upload_and_content_type_validation(client):
    png_bytes = b"\x89PNG\r\n\x1a\n"
    uploaded = client.post(
        "/api/v1/materials/upload",
        files={"file": ("test.png", png_bytes, "image/png")},
    )
    assert uploaded.status_code == 200
    url = uploaded.json()["url"]
    assert url.startswith("/uploads/materials/")

    filename = url.rsplit("/", 1)[-1]
    path = Path("uploads/materials") / filename
    assert path.exists()
    assert path.read_bytes() == png_bytes
    served = client.get(url)
    assert served.status_code == 200
    assert served.content == png_bytes
    path.unlink()

    invalid = client.post(
        "/api/v1/materials/upload",
        files={"file": ("test.txt", b"hello", "text/plain")},
    )
    assert invalid.status_code == 400


def test_material_video_upload_and_cleanup(client):
    video_bytes = b"\x00\x00\x00\x18ftypmp42"
    uploaded = client.post(
        "/api/v1/materials/upload-video",
        files={"file": ("demo.mp4", video_bytes, "video/mp4")},
    )
    assert uploaded.status_code == 200
    url = uploaded.json()["url"]
    assert url.startswith("/uploads/materials/")

    filename = url.rsplit("/", 1)[-1]
    path = Path("uploads/materials") / filename
    assert path.exists()
    assert path.read_bytes() == video_bytes
    assert client.get(url).content == video_bytes

    material = client.post(
        "/api/v1/materials",
        json={
            "title": "视频素材测试",
            "post_type": "video",
            "content": "包含视频的素材正文",
            "video_urls": [url],
        },
    ).json()
    assert client.delete(f"/api/v1/materials/{material['id']}").status_code == 204
    assert not path.exists()

    invalid = client.post(
        "/api/v1/materials/upload-video",
        files={"file": ("demo.txt", b"hello", "text/plain")},
    )
    assert invalid.status_code == 400


def test_material_post_and_video_types_are_independent(client):
    post_title = "普通贴吧主题帖标题"
    video_title = "这是一个最多允许六十个字的视频主题帖标题用于验证普通帖和视频帖的独立输入规则"
    video = client.post(
        "/api/v1/materials",
        json={
            "title": video_title,
            "post_type": "video",
            "content": "",
            "video_urls": ["https://example.com/demo.mp4"],
        },
    )
    assert video.status_code == 201
    video_body = video.json()
    assert video_body["post_type"] == "video"
    assert video_body["content"] == ""

    mixed = client.post(
        "/api/v1/materials",
        json={
            "title": post_title,
            "post_type": "post",
            "content": "普通帖正文",
            "video_urls": ["https://example.com/demo.mp4"],
        },
    )
    assert mixed.status_code == 400
    assert "普通帖不能包含视频" in mixed.json()["detail"]

    overlong_post = client.post(
        "/api/v1/materials",
        json={
            "title": "普" * 32,
            "post_type": "post",
            "content": "普通帖正文",
        },
    )
    assert overlong_post.status_code == 400
    assert "5-31" in overlong_post.json()["detail"]

    video_with_image = client.post(
        "/api/v1/materials",
        json={
            "title": video_title,
            "post_type": "video",
            "video_urls": ["https://example.com/demo.mp4"],
            "image_urls": ["https://example.com/a.jpg"],
        },
    )
    assert video_with_image.status_code == 400
    assert "不能同时包含图片" in video_with_image.json()["detail"]


def test_material_requires_title_and_content(client):
    assert client.post("/api/v1/materials", json={"title": "", "content": "x"}).status_code == 422
    assert client.post("/api/v1/materials", json={"title": "x", "content": ""}).status_code == 400


def test_delete_material_removes_unused_uploaded_image(client):
    uploaded = client.post(
        "/api/v1/materials/upload",
        files={"file": ("cleanup.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    ).json()
    url = uploaded["url"]
    path = Path("uploads/materials") / url.rsplit("/", 1)[-1]
    assert path.exists()

    material = client.post(
        "/api/v1/materials",
        json={
            "title": "带图素材测试",
            "content": "删除后应清理图片",
            "image_urls": [url],
        },
    ).json()
    assert client.delete(f"/api/v1/materials/{material['id']}").status_code == 204
    assert not path.exists()
