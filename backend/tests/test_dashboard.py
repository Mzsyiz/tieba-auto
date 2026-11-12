from datetime import datetime

from app.models.account_forum import AccountForum
from app.models.post_task import PostTaskLog
from app.models.sign_log import SignLog


def test_dashboard_aggregates_core_statistics(client, db_session_factory):
    account = client.post(
        "/api/v1/accounts",
        json={
            "username": "dashboard_account",
            "bduss": "x" * 192,
            "status": "valid",
        },
    ).json()
    forum = client.post(
        "/api/v1/forums",
        json={"names": "首页统计吧"},
    ).json()["items"][0]
    material = client.post(
        "/api/v1/materials",
        json={
            "title": "首页统计素材",
            "content": "用于首页统计测试。",
        },
    ).json()
    proxy = client.post(
        "/api/v1/proxies",
        json={"host": "dashboard-proxy.example.com", "port": 8080},
    ).json()
    task = client.post(
        "/api/v1/post-tasks",
        json={
            "name": "首页统计任务",
            "account_ids": [account["id"]],
            "forum_ids": [forum["id"]],
            "material_ids": [material["id"]],
            "interval_min": 0,
            "interval_max": 0,
        },
    ).json()
    now = datetime.now().astimezone()

    with db_session_factory() as db:
        db.add(
            AccountForum(
                account_id=account["id"],
                forum_id=forum["id"],
                is_followed=True,
            )
        )
        db.add(
            SignLog(
                account_id=account["id"],
                forum_id=forum["id"],
                fname=forum["fname"],
                status="success",
                success=True,
                message="签到成功",
                signed_at=now,
            )
        )
        db.add(
            PostTaskLog(
                task_id=task["id"],
                account_id=account["id"],
                account_name="dashboard_account",
                forum_id=forum["id"],
                fname=forum["fname"],
                material_id=material["id"],
                title=material["title"],
                status="failed",
                message="测试失败",
                created_at=now,
            )
        )
        db.commit()

    response = client.get("/api/v1/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["overview"] == {
        "account_total": 1,
        "account_valid": 1,
        "account_with_credentials": 1,
        "followed_forums": 1,
        "manual_forums": 1,
        "material_total": 1,
        "material_video": 0,
        "proxy_total": 1,
        "proxy_active": 1,
        "proxy_online": 0,
    }
    assert body["tasks"]["total"] == 1
    assert body["tasks"]["pending"] == 1
    assert body["signs"]["today_total"] == 1
    assert body["signs"]["success"] == 1
    assert body["recent_tasks"][0]["name"] == "首页统计任务"
    assert body["recent_signs"][0]["fname"] == "首页统计吧"
    assert body["recent_post_failures"][0]["message"] == "测试失败"
    assert body["overview"]["proxy_total"] == 1
    assert proxy["id"] > 0
