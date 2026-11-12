from datetime import UTC, datetime

from app.core.threads import OwnThread


def _account(client) -> dict:
    response = client.post(
        "/api/v1/accounts",
        json={
            "username": "posts_owner",
            "bduss": "x" * 192,
            "status": "valid",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_list_owned_posts_maps_thread_content_and_metadata(client, monkeypatch):
    account = _account(client)

    def fake_list_own_threads(
        bduss: str,
        stoken: str = "",
        *,
        page: int = 1,
        timeout: float = 30.0,
        **kwargs,
    ) -> list[OwnThread]:
        assert bduss == "x" * 192
        assert page == 2
        return [
            OwnThread(
                fid=42,
                fname="传奇吧",
                tid=123456,
                pid=654321,
                title="测试主题",
                content="这是正文",
                image_urls=["https://example.com/a.jpg"],
                video_url="https://example.com/a.mp4",
                view_num=20,
                reply_num=3,
                agree_num=2,
                created_at=datetime(2026, 11, 11, 8, 0, tzinfo=UTC),
            )
        ]

    monkeypatch.setattr("app.api.v1.account_posts.list_own_threads", fake_list_own_threads)
    response = client.get(
        "/api/v1/account-posts",
        params={"account_id": account["id"], "page": 2},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 2
    assert body["has_more"] is False
    assert body["items"][0] == {
        "fid": 42,
        "fname": "传奇吧",
        "tid": 123456,
        "pid": 654321,
        "title": "测试主题",
        "content": "这是正文",
        "image_urls": ["https://example.com/a.jpg"],
        "video_url": "https://example.com/a.mp4",
        "view_num": 20,
        "reply_num": 3,
        "agree_num": 2,
        "created_at": "2026-11-11T08:00:00Z",
        "url": "https://tieba.baidu.com/p/123456?fid=42&kw=%E4%BC%A0%E5%A5%87%E5%90%A7",
    }


def test_delete_owned_post_uses_account_credentials(client, monkeypatch):
    account = _account(client)
    calls: list[tuple[str, str, str, int]] = []

    def fake_delete(
        bduss: str,
        stoken: str,
        fname: str,
        tid: int,
        timeout: float = 30.0,
        **kwargs,
    ) -> None:
        calls.append((bduss, stoken, fname, tid))

    monkeypatch.setattr("app.api.v1.account_posts.delete_own_thread", fake_delete)
    response = client.post(
        "/api/v1/account-posts/delete",
        json={"account_id": account["id"], "fname": "传奇吧", "tid": 123456},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert calls == [("x" * 192, "", "传奇吧", 123456)]


def test_account_posts_require_credentials_and_account(client):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "posts_without_credentials"},
    ).json()
    missing_credentials = client.get(
        "/api/v1/account-posts",
        params={"account_id": account["id"]},
    )
    assert missing_credentials.status_code == 400

    missing_account = client.get(
        "/api/v1/account-posts",
        params={"account_id": 999999},
    )
    assert missing_account.status_code == 404
