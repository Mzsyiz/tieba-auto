from datetime import date, datetime

from app.services.auto_sign import AutoSignState, is_auto_sign_due


def test_auto_settings_defaults_and_update(client):
    settings = client.get("/api/v1/sign/auto/settings")
    assert settings.status_code == 200
    data = settings.json()
    assert data["enabled"] is False
    assert data["schedule_time"] == "08:00"
    assert data["interval_min"] == 1.0
    assert data["interval_max"] == 3.0
    assert data["account_interval_min"] == 2.0
    assert data["account_interval_max"] == 5.0
    assert data["account_ids"] == []

    updated = client.put(
        "/api/v1/sign/auto/settings",
        json={
            "enabled": True,
            "schedule_time": "07:30",
            "interval_min": 2,
            "interval_max": 5,
            "account_interval_min": 3,
            "account_interval_max": 6,
            "account_ids": [1, 2],
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["enabled"] is True
    assert body["schedule_time"] == "07:30"
    assert body["account_ids"] == [1, 2]

    persisted = client.get("/api/v1/sign/auto/settings").json()
    assert persisted["interval_min"] == 2.0
    assert persisted["account_interval_max"] == 6.0

    invalid = client.put(
        "/api/v1/sign/auto/settings",
        json={
            "enabled": False,
            "schedule_time": "08:00",
            "interval_min": 10,
            "interval_max": 3,
            "account_interval_min": 2,
            "account_interval_max": 5,
            "account_ids": [],
        },
    )
    assert invalid.status_code == 400


def test_auto_start_and_stop_routes(client, monkeypatch):
    async def fake_start(*args, **kwargs):
        return AutoSignState(
            running=True,
            started_at=datetime.now().astimezone(),
            message="running",
            account_total=2,
        )

    async def fake_stop():
        return AutoSignState(running=False, message="stopped")

    monkeypatch.setattr("app.api.v1.sign.auto_sign_manager.start", fake_start)
    monkeypatch.setattr("app.api.v1.sign.auto_sign_manager.stop", fake_stop)

    started = client.post(
        "/api/v1/sign/auto/start",
        json={"account_ids": [1]},
    )
    assert started.status_code == 200
    assert started.json()["running"] is True
    assert started.json()["account_total"] == 2

    stopped = client.post("/api/v1/sign/auto/stop")
    assert stopped.status_code == 200
    assert stopped.json()["running"] is False

    status = client.get("/api/v1/sign/auto/status")
    assert status.status_code == 200
    assert status.json()["running"] is False


def test_daily_schedule_catches_up_and_runs_once():
    now = datetime(2026, 11, 11, 9, 30)
    assert is_auto_sign_due(
        enabled=True,
        schedule_time="08:00",
        last_run_date=None,
        now=now,
    )
    assert not is_auto_sign_due(
        enabled=True,
        schedule_time="08:00",
        last_run_date=date(2026, 11, 11),
        now=now,
    )
    assert not is_auto_sign_due(
        enabled=True,
        schedule_time="10:00",
        last_run_date=None,
        now=now,
    )
