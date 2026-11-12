import time
from datetime import datetime

from sqlalchemy import select

from app.core.tieba import FollowActionResult, SignResult
from app.models.account_forum import AccountForum


def _setup_account_with_forums(client, monkeypatch, names: list[str]):
    account = client.post(
        "/api/v1/accounts",
        json={
            "username": f"sign_{time.time_ns()}",
            "bduss": "x" * 192,
            "status": "valid",
        },
    ).json()
    created = client.post("/api/v1/forums", json={"names": ",".join(names)}).json()
    forum_ids = [item["id"] for item in created["items"]]

    def fake_follow(
        bduss,
        stoken,
        targets,
        *,
        unfollow=False,
        timeout=90.0,
        **kwargs,
    ):
        return [FollowActionResult(fname=target, success=True) for target in targets]

    monkeypatch.setattr("app.api.v1.forums.update_follow_relations", fake_follow)
    response = client.post(
        "/api/v1/forums/follow",
        json={"account_id": account["id"], "forum_ids": forum_ids},
    )
    assert response.status_code == 200
    return account, forum_ids


def test_sign_overview_starts_pending(client, monkeypatch):
    account, _ = _setup_account_with_forums(
        client,
        monkeypatch,
        ["签到吧一", "签到吧二"],
    )
    overview = client.get(f"/api/v1/sign/accounts/{account['id']}")
    assert overview.status_code == 200
    data = overview.json()
    assert data["total"] == 2
    assert data["stats"] == {
        "total": 2,
        "signed": 0,
        "pending": 2,
        "failed": 0,
        "banned": 0,
    }
    assert all(item["last_sign_status"] == "pending" for item in data["items"])


def test_sign_overview_repairs_today_success_flag(
    client,
    db_session_factory,
    monkeypatch,
):
    account, forum_ids = _setup_account_with_forums(
        client,
        monkeypatch,
        ["修复签到状态吧"],
    )
    with db_session_factory() as db:
        link = db.scalar(
            select(AccountForum).where(
                AccountForum.account_id == account["id"],
                AccountForum.forum_id == forum_ids[0],
            )
        )
        assert link is not None
        link.is_signed = False
        link.last_sign_status = "success"
        link.last_sign_at = datetime.now().astimezone()
        db.commit()

    data = client.get(f"/api/v1/sign/accounts/{account['id']}").json()

    assert data["stats"]["signed"] == 1
    assert data["stats"]["pending"] == 0
    assert data["items"][0]["is_signed"] is True


def test_sign_selected_forum_writes_status_and_log(client, monkeypatch):
    account, forum_ids = _setup_account_with_forums(
        client,
        monkeypatch,
        ["单签吧一", "单签吧二"],
    )

    def fake_sign(bduss, stoken, targets, timeout=180.0, **kwargs):
        return [SignResult(fname=target, success=True, message="签到成功") for target in targets]

    monkeypatch.setattr("app.api.v1.sign.sign_forums_sync", fake_sign)
    result = client.post(
        f"/api/v1/sign/accounts/{account['id']}/sign",
        json={"forum_ids": [forum_ids[0]]},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["success"] == 1
    assert body["already"] == 0
    assert body["failed"] == 0

    overview = client.get(f"/api/v1/sign/accounts/{account['id']}").json()
    assert overview["stats"]["signed"] == 1
    assert overview["stats"]["pending"] == 1
    signed_item = next(item for item in overview["items"] if item["forum_id"] == forum_ids[0])
    assert signed_item["is_signed"] is True
    assert signed_item["sign_count"] == 1
    assert signed_item["history_success"] == 1

    logs = client.get(
        "/api/v1/sign/logs",
        params={"account_id": account["id"]},
    ).json()
    assert len(logs["items"]) == 1
    assert logs["items"][0]["status"] == "success"


def test_already_signed_is_counted_once(client, monkeypatch):
    account, forum_ids = _setup_account_with_forums(
        client,
        monkeypatch,
        ["已签吧"],
    )

    def fake_sign(bduss, stoken, targets, timeout=180.0, **kwargs):
        return [
            SignResult(
                fname=target,
                success=True,
                already_signed=True,
                message="今日已签到",
            )
            for target in targets
        ]

    monkeypatch.setattr("app.api.v1.sign.sign_forums_sync", fake_sign)
    first = client.post(
        f"/api/v1/sign/accounts/{account['id']}/sign",
        json={"forum_ids": forum_ids},
    ).json()
    assert first["already"] == 1
    assert first["success"] == 0

    second = client.post(
        f"/api/v1/sign/accounts/{account['id']}/sign",
        json={"forum_ids": forum_ids},
    ).json()
    assert second["already"] == 1

    overview = client.get(f"/api/v1/sign/accounts/{account['id']}").json()
    item = overview["items"][0]
    assert item["is_signed"] is True
    assert item["sign_count"] == 1
    assert item["history_success"] == 1


def test_sign_failure_marks_banned(client, monkeypatch):
    account, forum_ids = _setup_account_with_forums(
        client,
        monkeypatch,
        ["封禁吧"],
    )

    def fake_sign(bduss, stoken, targets, timeout=180.0, **kwargs):
        return [
            SignResult(
                fname=target,
                success=False,
                forum_invalid=True,
                banned=True,
                error_code=3250004,
                message="当前账号在该吧被封禁 (3250004)",
            )
            for target in targets
        ]

    monkeypatch.setattr("app.api.v1.sign.sign_forums_sync", fake_sign)
    result = client.post(
        f"/api/v1/sign/accounts/{account['id']}/sign",
        json={"forum_ids": forum_ids},
    ).json()
    assert result["failed"] == 1

    overview = client.get(f"/api/v1/sign/accounts/{account['id']}").json()
    item = overview["items"][0]
    assert item["is_banned"] is True
    assert item["last_sign_status"] == "failed"
    assert "封禁" in item["sign_error"]
    assert overview["stats"]["banned"] == 1


def test_sign_all_pending_and_empty_retry(client, monkeypatch):
    account, _ = _setup_account_with_forums(
        client,
        monkeypatch,
        ["全签吧一", "全签吧二"],
    )

    def fake_sign(bduss, stoken, targets, timeout=180.0, **kwargs):
        return [SignResult(fname=target, success=True, message="签到成功") for target in targets]

    monkeypatch.setattr("app.api.v1.sign.sign_forums_sync", fake_sign)
    result = client.post(f"/api/v1/sign/accounts/{account['id']}/sign", json={})
    assert result.status_code == 200
    assert result.json()["success"] == 2

    retry = client.post(f"/api/v1/sign/accounts/{account['id']}/sign", json={})
    assert retry.status_code == 400
    assert "没有待签到" in retry.json()["detail"]


def test_sign_rejects_partially_invalid_forum_ids(client, monkeypatch):
    account, forum_ids = _setup_account_with_forums(
        client,
        monkeypatch,
        ["有效签到吧"],
    )
    result = client.post(
        f"/api/v1/sign/accounts/{account['id']}/sign",
        json={"forum_ids": [forum_ids[0], 999999]},
    )
    assert result.status_code == 400
    assert "不在该账号关注列表中" in result.json()["detail"]
