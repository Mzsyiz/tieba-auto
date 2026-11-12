import asyncio
from datetime import datetime, timedelta

from app.core.poster import PostResult
from app.models.account_forum import AccountForum
from app.models.post_task import PostTask
from app.services.post_tasks import post_task_manager


def _create_post_data(client, suffix: str):
    accounts = [
        client.post(
            "/api/v1/accounts",
            json={
                "username": f"post_acc_{suffix}_{index}",
                "bduss": "x" * 192,
                "status": "valid",
            },
        ).json()
        for index in range(2)
    ]
    forums = client.post(
        "/api/v1/forums",
        json={"names": f"发帖吧{suffix}一,发帖吧{suffix}二"},
    ).json()["items"]
    material = client.post(
        "/api/v1/materials",
        json={
            "title": f"发帖素材{suffix}",
            "content": "用于发帖任务测试的正文内容。",
            "tags": ["发帖测试"],
        },
    ).json()
    return accounts, forums, material


def test_create_post_task_and_validation(client):
    accounts, forums, material = _create_post_data(client, "create")
    created = client.post(
        "/api/v1/post-tasks",
        json={
            "name": "测试发帖任务",
            "account_ids": [account["id"] for account in accounts],
            "forum_ids": [forum["id"] for forum in forums],
            "material_ids": [material["id"]],
            "interval_min": 0,
            "interval_max": 0,
        },
    )
    assert created.status_code == 201
    task = created.json()
    assert task["total"] == 4
    assert task["status"] == "pending"
    assert task["strategy"] == "round_robin"

    listed = client.get("/api/v1/post-tasks").json()
    assert listed["stats"]["pending"] == 1

    invalid_interval = client.post(
        "/api/v1/post-tasks",
        json={
            "account_ids": [accounts[0]["id"]],
            "forum_ids": [forums[0]["id"]],
            "material_ids": [material["id"]],
            "interval_min": 10,
            "interval_max": 2,
        },
    )
    assert invalid_interval.status_code == 400

    missing = client.post(
        "/api/v1/post-tasks",
        json={
            "account_ids": [999999],
            "forum_ids": [forums[0]["id"]],
            "material_ids": [material["id"]],
        },
    )
    assert missing.status_code == 404


def test_post_task_manager_runs_all_jobs(client, db_session_factory, monkeypatch):
    accounts, forums, material = _create_post_data(client, "run")
    task = client.post(
        "/api/v1/post-tasks",
        json={
            "name": "执行测试任务",
            "account_ids": [account["id"] for account in accounts],
            "forum_ids": [forum["id"] for forum in forums],
            "material_ids": [material["id"]],
            "interval_min": 0,
            "interval_max": 0,
        },
    ).json()

    seen_timeouts: list[float] = []

    async def fake_publish(
        bduss,
        stoken,
        fname,
        title,
        content,
        image_urls=None,
        **kwargs,
    ):
        seen_timeouts.append(kwargs["request_timeout"])
        return PostResult(True, tid=123456, message="发帖成功")

    monkeypatch.setattr("app.services.post_tasks.SessionLocal", db_session_factory)
    monkeypatch.setattr("app.services.post_tasks.publish_thread", fake_publish)

    async def run_task():
        await post_task_manager.start(task["id"])
        assert post_task_manager._task is not None
        await asyncio.wait_for(post_task_manager._task, timeout=10)

    asyncio.run(run_task())

    detail = client.get(f"/api/v1/post-tasks/{task['id']}").json()
    assert detail["task"]["status"] == "completed"
    assert detail["task"]["completed"] == 4
    assert detail["task"]["success"] == 4
    assert detail["task"]["failed"] == 0
    assert len(detail["logs"]) == 4
    assert all(log["status"] == "success" for log in detail["logs"])
    assert all(log["tid"] == 123456 for log in detail["logs"])
    assert seen_timeouts == [30.0, 30.0, 30.0, 30.0]

    materials = client.get("/api/v1/materials").json()
    saved = next(item for item in materials["items"] if item["id"] == material["id"])
    assert saved["usage_count"] == 4
    assert saved["status"] == "used"


def test_delete_pending_post_task(client):
    accounts, forums, material = _create_post_data(client, "delete")
    task = client.post(
        "/api/v1/post-tasks",
        json={
            "account_ids": [accounts[0]["id"]],
            "forum_ids": [forums[0]["id"]],
            "material_ids": [material["id"]],
            "interval_min": 0,
            "interval_max": 0,
        },
    ).json()
    assert client.delete(f"/api/v1/post-tasks/{task['id']}").status_code == 204
    assert client.get(f"/api/v1/post-tasks/{task['id']}").status_code == 404


def test_update_pending_post_task(client):
    accounts, forums, material = _create_post_data(client, "update")
    task = client.post(
        "/api/v1/post-tasks",
        json={
            "name": "原始任务名",
            "account_ids": [accounts[0]["id"], accounts[1]["id"]],
            "forum_ids": [forums[0]["id"], forums[1]["id"]],
            "material_ids": [material["id"]],
            "interval_min": 0,
            "interval_max": 0,
        },
    ).json()

    updated = client.patch(
        f"/api/v1/post-tasks/{task['id']}",
        json={
            "name": "修改后的任务名",
            "account_ids": [accounts[0]["id"]],
            "forum_ids": [forums[0]["id"]],
            "material_ids": [material["id"]],
            "interval_min": 5,
            "interval_max": 15,
            "scheduled_at": "2026-11-12T09:00:00",
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "修改后的任务名"
    assert body["total"] == 1
    assert body["account_ids"] == [accounts[0]["id"]]
    assert body["forum_ids"] == [forums[0]["id"]]
    assert body["interval_min"] == 5
    assert body["interval_max"] == 15
    assert body["scheduled_at"] is not None
    assert body["status"] == "pending"


def test_scheduled_post_task_cannot_start_before_plan_time(
    client,
    db_session_factory,
    monkeypatch,
):
    accounts, forums, material = _create_post_data(client, "scheduled")
    scheduled_at = datetime.now().astimezone() + timedelta(hours=1)
    task = client.post(
        "/api/v1/post-tasks",
        json={
            "name": "尚未到计划时间的任务",
            "account_ids": [accounts[0]["id"]],
            "forum_ids": [forums[0]["id"]],
            "material_ids": [material["id"]],
            "interval_min": 0,
            "interval_max": 0,
            "scheduled_at": scheduled_at.isoformat(),
        },
    ).json()

    monkeypatch.setattr("app.services.post_tasks.SessionLocal", db_session_factory)
    started = client.post(f"/api/v1/post-tasks/{task['id']}/start")

    assert started.status_code == 400
    assert "尚未到执行时间" in started.json()["detail"]
    current = client.get(f"/api/v1/post-tasks/{task['id']}").json()["task"]
    assert current["status"] == "pending"
    assert current["completed"] == 0


def test_clone_post_task_and_block_running_edits(client, db_session_factory):
    accounts, forums, material = _create_post_data(client, "clone")
    task = client.post(
        "/api/v1/post-tasks",
        json={
            "name": "可复制任务",
            "account_ids": [account["id"] for account in accounts],
            "forum_ids": [forum["id"] for forum in forums],
            "material_ids": [material["id"]],
            "interval_min": 2,
            "interval_max": 6,
        },
    ).json()

    cloned = client.post(f"/api/v1/post-tasks/{task['id']}/clone")
    assert cloned.status_code == 200
    clone = cloned.json()
    assert clone["id"] != task["id"]
    assert clone["name"] == "可复制任务（副本）"
    assert clone["status"] == "pending"
    assert clone["total"] == 4
    assert clone["scheduled_at"] is None

    with db_session_factory() as db:
        running = db.get(PostTask, task["id"])
        assert running is not None
        running.status = "running"
        db.commit()

    update = client.patch(
        f"/api/v1/post-tasks/{task['id']}",
        json={
            "account_ids": [accounts[0]["id"]],
            "forum_ids": [forums[0]["id"]],
            "material_ids": [material["id"]],
        },
    )
    assert update.status_code == 409
    assert client.post(f"/api/v1/post-tasks/{task['id']}/clone").status_code == 409


def test_video_material_is_not_silently_published_as_normal_post(
    client,
    db_session_factory,
    monkeypatch,
):
    accounts, forums, _ = _create_post_data(client, "video")
    video_material = client.post(
        "/api/v1/materials",
        json={
            "title": "独立视频帖素材测试",
            "post_type": "video",
            "content": "",
            "video_urls": ["https://example.com/demo.mp4"],
        },
    ).json()
    task = client.post(
        "/api/v1/post-tasks",
        json={
            "account_ids": [accounts[0]["id"]],
            "forum_ids": [forums[0]["id"]],
            "material_ids": [video_material["id"]],
            "interval_min": 0,
            "interval_max": 0,
        },
    ).json()

    called = False

    async def fake_publish(
        bduss,
        stoken,
        fname,
        title,
        content,
        image_urls=None,
        **kwargs,
    ):
        nonlocal called
        called = True
        return PostResult(True, tid=1, message="不应调用普通发帖")

    monkeypatch.setattr("app.services.post_tasks.SessionLocal", db_session_factory)
    monkeypatch.setattr("app.services.post_tasks.publish_thread", fake_publish)

    async def run_task():
        await post_task_manager.start(task["id"])
        assert post_task_manager._task is not None
        await asyncio.wait_for(post_task_manager._task, timeout=10)

    asyncio.run(run_task())

    detail = client.get(f"/api/v1/post-tasks/{task['id']}").json()
    assert called is False
    assert detail["task"]["status"] == "failed"
    assert detail["logs"][0]["status"] == "failed"
    assert "视频发布通道尚未接入" in detail["logs"][0]["message"]


def test_post_task_rejects_banned_forum_and_disabled_material(
    client,
    db_session_factory,
):
    accounts, forums, material = _create_post_data(client, "eligibility")
    base_payload = {
        "account_ids": [accounts[0]["id"]],
        "forum_ids": [forums[0]["id"]],
        "material_ids": [material["id"]],
        "interval_min": 0,
        "interval_max": 0,
    }
    assert client.patch(
        f"/api/v1/forums/{forums[0]['id']}",
        json={"is_banned": True, "ban_reason": "测试封禁"},
    ).status_code == 200
    banned = client.post("/api/v1/post-tasks", json=base_payload)
    assert banned.status_code == 400
    assert "已封禁贴吧" in banned.json()["detail"]

    client.patch(
        f"/api/v1/forums/{forums[0]['id']}",
        json={"is_banned": False},
    )
    client.patch(
        f"/api/v1/materials/{material['id']}",
        json={"status": "disabled"},
    )
    disabled = client.post("/api/v1/post-tasks", json=base_payload)
    assert disabled.status_code == 400
    assert "已停用素材" in disabled.json()["detail"]

    client.patch(
        f"/api/v1/materials/{material['id']}",
        json={"status": "available"},
    )
    with db_session_factory() as db:
        db.add(
            AccountForum(
                account_id=accounts[0]["id"],
                forum_id=forums[0]["id"],
                is_followed=True,
                is_banned=True,
                ban_reason="账号在该吧被封禁",
            )
        )
        db.commit()
    account_banned = client.post("/api/v1/post-tasks", json=base_payload)
    assert account_banned.status_code == 400
    assert "所选账号在这些贴吧被封禁" in account_banned.json()["detail"]


def test_stale_running_post_task_is_recovered(client, db_session_factory):
    accounts, forums, material = _create_post_data(client, "stale")
    task = client.post(
        "/api/v1/post-tasks",
        json={
            "account_ids": [accounts[0]["id"]],
            "forum_ids": [forums[0]["id"]],
            "material_ids": [material["id"]],
            "interval_min": 0,
            "interval_max": 0,
        },
    ).json()
    with db_session_factory() as db:
        stale = db.get(PostTask, task["id"])
        assert stale is not None
        stale.status = "running"
        db.commit()

    recovered = next(
        item
        for item in client.get("/api/v1/post-tasks").json()["items"]
        if item["id"] == task["id"]
    )
    assert recovered["status"] == "stopped"
    assert "任务已停止" in recovered["last_error"]
