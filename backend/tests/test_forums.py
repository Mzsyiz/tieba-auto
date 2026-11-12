from app.core.tieba import FollowActionResult, FollowedForum
from app.models.account_forum import AccountForum


def test_follow_interval_default_is_between_2_and_5_seconds(monkeypatch):
    from app.core.tieba import _follow_interval_seconds

    monkeypatch.delenv("TIEBA_FOLLOW_MIN_INTERVAL", raising=False)
    monkeypatch.delenv("TIEBA_FOLLOW_MAX_INTERVAL", raising=False)
    for _ in range(5):
        assert 2.0 <= _follow_interval_seconds() <= 5.0


def test_clear_account_forum_ban(client, db_session_factory):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "unban_account", "status": "valid"},
    ).json()
    forum = client.post(
        "/api/v1/forums",
        json={"names": "解除标记吧"},
    ).json()["items"][0]
    with db_session_factory() as db:
        db.add(
            AccountForum(
                account_id=account["id"],
                forum_id=forum["id"],
                is_followed=True,
                is_banned=True,
                ban_reason="测试封禁",
                last_sign_status="failed",
            )
        )
        db.commit()

    response = client.post(
        f"/api/v1/forums/accounts/{account['id']}/forums/{forum['id']}/unban"
    )
    assert response.status_code == 200
    assert response.json()["is_banned"] is False
    assert response.json()["ban_reason"] is None


def test_create_list_and_duplicate_forums(client):
    created = client.post(
        "/api/v1/forums",
        json={"names": "传奇,复古传奇\n迷失传奇", "is_post_target": True},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["added"] == 3
    assert body["promoted"] == 0
    assert body["existing"] == 0

    listed = client.get("/api/v1/forums")
    assert listed.status_code == 200
    data = listed.json()
    assert data["total"] == 3
    assert data["stats"]["total"] == 3
    assert data["stats"]["active"] == 3
    assert data["stats"]["post_targets"] == 3

    duplicate = client.post("/api/v1/forums", json={"names": "传奇,新吧"})
    assert duplicate.status_code == 201
    assert duplicate.json()["added"] == 1
    assert duplicate.json()["promoted"] == 0
    assert duplicate.json()["existing"] == 1


def test_update_forum_status(client):
    created = client.post("/api/v1/forums", json={"names": "状态测试吧"}).json()
    forum_id = created["items"][0]["id"]

    updated = client.patch(
        f"/api/v1/forums/{forum_id}",
        json={"is_post_target": True, "notes": "重点吧", "level": 6},
    )
    assert updated.status_code == 200
    assert updated.json()["is_post_target"] is True
    assert updated.json()["notes"] == "重点吧"
    assert updated.json()["level"] == 6

    banned = client.patch(
        f"/api/v1/forums/{forum_id}",
        json={"is_banned": True, "ban_reason": "吧务封禁"},
    )
    assert banned.json()["is_banned"] is True
    assert banned.json()["ban_reason"] == "吧务封禁"

    unbanned = client.patch(f"/api/v1/forums/{forum_id}", json={"is_banned": False})
    assert unbanned.json()["is_banned"] is False
    assert unbanned.json()["ban_reason"] is None


def test_sync_followed_forums(client, monkeypatch):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "sync_account", "bduss": "x" * 192, "status": "valid"},
    ).json()

    def fake_fetch(bduss, stoken="", timeout=30.0, **kwargs):
        return [
            FollowedForum(fid=1001, fname="同步吧一", level=4),
            FollowedForum(fid=1002, fname="同步吧二", level=7),
        ]

    monkeypatch.setattr("app.services.forum_sync.fetch_followed_forums", fake_fetch)
    res = client.post("/api/v1/forums/sync", json={"account_id": account["id"]})
    assert res.status_code == 200
    body = res.json()
    assert body["fetched"] == 2
    assert body["added"] == 2
    assert body["account_name"] == "sync_account"

    again = client.post("/api/v1/forums/sync", json={"account_id": account["id"]})
    assert again.status_code == 200
    assert again.json()["added"] == 0
    assert again.json()["updated"] == 2

    account_forums = client.get(f"/api/v1/forums/accounts/{account['id']}")
    assert account_forums.status_code == 200
    data = account_forums.json()
    assert data["total"] == 2
    assert data["stats"]["followed"] == 2
    assert {item["fname"] for item in data["items"]} == {"同步吧一", "同步吧二"}

    followed_only = client.get(
        "/api/v1/forums",
        params={"account_id": account["id"], "follow_state": "followed"},
    )
    assert followed_only.status_code == 200
    # 账号同步只进入账号关注视图，不灌入手动贴吧池
    assert followed_only.json()["total"] == 0


def test_delete_forum(client):
    created = client.post("/api/v1/forums", json={"names": "待删除吧"}).json()
    forum_id = created["items"][0]["id"]

    assert client.delete(f"/api/v1/forums/{forum_id}").status_code == 204
    assert client.delete(f"/api/v1/forums/{forum_id}").status_code == 404


def test_account_add_auto_syncs_followed_forums(client, monkeypatch):
    monkeypatch.delenv("TIEBA_DISABLE_AUTO_SYNC", raising=False)

    def fake_fetch(bduss, stoken="", timeout=30.0, **kwargs):
        return [FollowedForum(fid=5001, fname="自动同步吧", level=3)]

    monkeypatch.setattr("app.services.forum_sync.fetch_followed_forums", fake_fetch)
    account = client.post(
        "/api/v1/accounts",
        json={
            "username": "auto_sync_account",
            "bduss": "x" * 192,
            "status": "valid",
        },
    ).json()

    linked = client.get(f"/api/v1/forums/accounts/{account['id']}").json()
    assert linked["total"] == 1
    assert linked["items"][0]["fname"] == "自动同步吧"
    assert linked["items"][0]["is_followed"] is True


def test_follow_and_unfollow_pool_forums(client, monkeypatch):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "follow_account", "bduss": "x" * 192, "status": "valid"},
    ).json()
    created = client.post(
        "/api/v1/forums",
        json={"names": "关注吧一,关注吧二"},
    ).json()
    forum_ids = [item["id"] for item in created["items"]]

    def fake_update(
        bduss,
        stoken,
        targets,
        *,
        unfollow=False,
        timeout=90.0,
        **kwargs,
    ):
        return [FollowActionResult(fname=target, success=True) for target in targets]

    monkeypatch.setattr("app.api.v1.forums.update_follow_relations", fake_update)

    followed = client.post(
        "/api/v1/forums/follow",
        json={"account_id": account["id"], "forum_ids": forum_ids},
    )
    assert followed.status_code == 200
    assert followed.json()["success"] == 2
    assert followed.json()["failed"] == 0

    account_forums = client.get(f"/api/v1/forums/accounts/{account['id']}").json()
    assert account_forums["stats"]["followed"] == 2

    unfollowed = client.post(
        "/api/v1/forums/unfollow",
        json={"account_id": account["id"], "forum_ids": forum_ids},
    )
    assert unfollowed.status_code == 200
    assert unfollowed.json()["success"] == 2

    account_forums = client.get(f"/api/v1/forums/accounts/{account['id']}").json()
    assert account_forums["stats"]["followed"] == 0
    assert all(item["is_followed"] is False for item in account_forums["items"])


def test_follow_accepts_48_selected_forums(client, monkeypatch):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "bulk_account", "bduss": "x" * 192, "status": "valid"},
    ).json()
    names = ",".join(f"批量吧{index}" for index in range(48))
    created = client.post("/api/v1/forums", json={"names": names}).json()
    forum_ids = [item["id"] for item in created["items"]]
    assert len(forum_ids) == 48

    def fake_update(
        bduss,
        stoken,
        targets,
        *,
        unfollow=False,
        timeout=90.0,
        **kwargs,
    ):
        return [FollowActionResult(fname=target, success=True) for target in targets]

    monkeypatch.setattr("app.api.v1.forums.update_follow_relations", fake_update)
    result = client.post(
        "/api/v1/forums/follow",
        json={"account_id": account["id"], "forum_ids": forum_ids},
    )
    assert result.status_code == 200
    assert result.json()["success"] == 48
    assert result.json()["failed"] == 0


def test_follow_failure_does_not_mark_as_followed(client, monkeypatch):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "fail_account", "bduss": "x" * 192, "status": "valid"},
    ).json()
    forum = client.post("/api/v1/forums", json={"names": "失败测试吧"}).json()["items"][0]

    def fake_update(
        bduss,
        stoken,
        targets,
        *,
        unfollow=False,
        timeout=90.0,
        **kwargs,
    ):
        return [
            FollowActionResult(
                fname=target,
                success=False,
                error="未找到该贴吧，请确认吧名",
            )
            for target in targets
        ]

    monkeypatch.setattr("app.api.v1.forums.update_follow_relations", fake_update)
    result = client.post(
        "/api/v1/forums/follow",
        json={"account_id": account["id"], "forum_ids": [forum["id"]]},
    )
    assert result.status_code == 200
    assert result.json()["failed"] == 1

    account_forums = client.get(f"/api/v1/forums/accounts/{account['id']}").json()
    assert account_forums["stats"]["followed"] == 0
    assert account_forums["items"][0]["is_followed"] is False
    assert "未找到该贴吧" in account_forums["items"][0]["follow_error"]


def test_follow_suffix_merges_duplicate_forum(client, monkeypatch):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "merge_account", "bduss": "x" * 192, "status": "valid"},
    ).json()
    duplicate = client.post(
        "/api/v1/forums",
        json={"names": "1.76传奇吧"},
    ).json()["items"][0]
    normalized = client.post(
        "/api/v1/forums",
        json={"names": "1.76传奇"},
    ).json()["items"][0]

    def fake_update(
        bduss,
        stoken,
        targets,
        *,
        unfollow=False,
        timeout=90.0,
        **kwargs,
    ):
        return [
            FollowActionResult(
                fname=target,
                success=True,
                resolved_fname="1.76传奇",
            )
            for target in targets
        ]

    monkeypatch.setattr("app.api.v1.forums.update_follow_relations", fake_update)
    result = client.post(
        "/api/v1/forums/follow",
        json={"account_id": account["id"], "forum_ids": [duplicate["id"]]},
    )
    assert result.status_code == 200
    assert result.json()["success"] == 1

    forums = client.get("/api/v1/forums", params={"q": "1.76"}).json()
    assert forums["total"] == 1
    assert forums["items"][0]["id"] == normalized["id"]

    account_forums = client.get(f"/api/v1/forums/accounts/{account['id']}").json()
    assert account_forums["total"] == 1
    assert account_forums["items"][0]["forum_id"] == normalized["id"]
    assert account_forums["items"][0]["is_followed"] is True


def test_create_maps_suffix_duplicate_to_existing(client):
    result = client.post(
        "/api/v1/forums",
        json={"names": "重复吧传奇,重复吧传奇吧"},
    ).json()
    assert result["added"] == 1
    assert result["existing"] == 1

    forums = client.get("/api/v1/forums", params={"q": "重复吧传奇"}).json()
    assert forums["total"] == 1
    assert forums["items"][0]["fname"] == "重复吧传奇"


def test_create_promotes_account_sourced_forum(client, monkeypatch):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "promote_account", "bduss": "x" * 192, "status": "valid"},
    ).json()

    def fake_fetch(bduss, stoken="", timeout=30.0, **kwargs):
        return [FollowedForum(fid=999, fname="账号来源吧", level=2)]

    monkeypatch.setattr("app.services.forum_sync.fetch_followed_forums", fake_fetch)
    assert client.post("/api/v1/forums/sync", json={"account_id": account["id"]}).status_code == 200
    assert client.get("/api/v1/forums").json()["total"] == 0

    promoted = client.post("/api/v1/forums", json={"names": "账号来源吧"}).json()
    assert promoted["added"] == 0
    assert promoted["promoted"] == 1
    assert promoted["existing"] == 0

    pool = client.get("/api/v1/forums").json()
    assert pool["total"] == 1
    assert pool["items"][0]["fname"] == "账号来源吧"
    assert pool["items"][0]["source"] == "manual"


def test_import_account_follows_to_pool(client, monkeypatch):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "select_import_account", "bduss": "x" * 192, "status": "valid"},
    ).json()

    def fake_fetch(bduss, stoken="", timeout=30.0, **kwargs):
        return [FollowedForum(fid=1001, fname="选择加入吧", level=3)]

    monkeypatch.setattr("app.services.forum_sync.fetch_followed_forums", fake_fetch)
    client.post("/api/v1/forums/sync", json={"account_id": account["id"]})
    followed = client.get(f"/api/v1/forums/accounts/{account['id']}").json()
    forum_id = followed["items"][0]["forum_id"]

    imported = client.post(
        "/api/v1/forums/pool/import",
        json={"forum_ids": [forum_id]},
    )
    assert imported.status_code == 200
    assert imported.json()["promoted"] == 1

    pool = client.get("/api/v1/forums").json()
    assert pool["total"] == 1
    assert pool["items"][0]["fname"] == "选择加入吧"


def test_sync_does_not_import_into_manual_pool(client, monkeypatch):
    account = client.post(
        "/api/v1/accounts",
        json={"username": "pool_separation_account", "bduss": "x" * 192, "status": "valid"},
    ).json()
    client.post("/api/v1/forums", json={"names": "手动维护吧"})

    def fake_fetch(bduss, stoken="", timeout=30.0, **kwargs):
        return [FollowedForum(fid=777, fname="账号同步吧", level=2)]

    monkeypatch.setattr("app.services.forum_sync.fetch_followed_forums", fake_fetch)
    result = client.post("/api/v1/forums/sync", json={"account_id": account["id"]})
    assert result.status_code == 200

    pool = client.get("/api/v1/forums").json()
    assert {item["fname"] for item in pool["items"]} == {"手动维护吧"}
    assert all(item["source"] == "manual" for item in pool["items"])

    account_forums = client.get(f"/api/v1/forums/accounts/{account['id']}").json()
    assert {item["fname"] for item in account_forums["items"]} == {"账号同步吧"}
