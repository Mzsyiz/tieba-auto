from datetime import UTC, datetime

from app.models.account import Account
from app.models.proxy import ProxyNode
from app.services.proxy_service import _record_proxy_result, resolve_account_proxy


def test_proxy_pool_crud_bulk_binding_and_masking(client):
    created = client.post(
        "/api/v1/proxies",
        json={
            "name": "香港节点",
            "protocol": "http",
            "host": "proxy.example.com",
            "port": 8080,
            "username": "demo",
            "password": "secret",
        },
    )
    assert created.status_code == 201
    proxy = created.json()
    assert proxy["display_name"] == "香港节点"
    assert proxy["has_auth"] is True
    assert "username" not in proxy
    assert "password" not in proxy

    bulk = client.post(
        "/api/v1/proxies/bulk",
        json={
            "raw": "\n".join(
                [
                    "http://user:pass@1.1.1.1:8001",
                    "2.2.2.2:8002:user2:pass2",
                    "3.3.3.3:8003",
                    "2.2.2.2:8002:user2:pass2",
                    "invalid",
                ]
            )
        },
    )
    assert bulk.status_code == 200
    assert bulk.json()["added"] == 3
    assert bulk.json()["skipped"] == 1
    assert len(bulk.json()["errors"]) == 1

    account = client.post(
        "/api/v1/accounts",
        json={"username": "proxy_bound_account", "status": "valid"},
    ).json()
    bound = client.put(
        f"/api/v1/proxies/{proxy['id']}/bind",
        json={"account_ids": [account["id"]]},
    )
    assert bound.status_code == 200
    assert bound.json()["bound_accounts"] == [
        {"id": account["id"], "name": "proxy_bound_account"}
    ]
    account_body = client.get(f"/api/v1/accounts/{account['id']}").json()
    assert account_body["proxy_id"] == proxy["id"]

    listed = client.get("/api/v1/proxies", params={"q": "香港"}).json()
    assert listed["total"] == 1
    assert listed["stats"]["total"] == 4
    assert listed["stats"]["bound_accounts"] == 1

    assert client.delete(f"/api/v1/proxies/{proxy['id']}").status_code == 204
    account_body = client.get(f"/api/v1/accounts/{account['id']}").json()
    assert account_body["proxy_id"] is None


def test_proxy_test_updates_status(client, monkeypatch):
    proxy = client.post(
        "/api/v1/proxies",
        json={"host": "proxy.example.com", "port": 8080},
    ).json()

    async def fake_test(db, node, *, timeout_seconds=12.0):
        node.last_checked_at = datetime.now(UTC)
        node.latency_ms = 88
        node.success_count += 1
        db.commit()
        return True, 88, "连接正常，延迟 88ms"

    monkeypatch.setattr("app.api.v1.proxies.test_proxy_node", fake_test)
    response = client.post(f"/api/v1/proxies/{proxy['id']}/test")
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["latency_ms"] == 88


def test_app_settings_validation_and_system_info(client):
    settings = client.get("/api/v1/settings").json()
    assert settings["auto_sync_forums"] is True
    assert settings["post_interval_min"] == 10

    updated_payload = {
        **settings,
        "auto_sync_forums": False,
        "default_proxy_id": None,
        "proxy_auto_disable": True,
        "proxy_failure_threshold": 5,
        "request_timeout_seconds": 45,
        "follow_interval_min": 3,
        "follow_interval_max": 8,
        "sign_interval_min": 2,
        "sign_interval_max": 6,
        "post_interval_min": 20,
        "post_interval_max": 60,
        "post_prewarm_min": 2,
        "post_prewarm_max": 4,
        "max_task_total": 200,
    }
    updated_payload.pop("id")
    updated_payload.pop("updated_at")
    updated = client.put("/api/v1/settings", json=updated_payload)
    assert updated.status_code == 200
    assert updated.json()["max_task_total"] == 200
    assert updated.json()["auto_sync_forums"] is False

    invalid = client.put(
        "/api/v1/settings",
        json={**updated_payload, "follow_interval_min": 10, "follow_interval_max": 2},
    )
    assert invalid.status_code == 400
    assert "不能大于" in invalid.json()["detail"]

    system_info = client.get("/api/v1/settings/system").json()
    assert system_info["version"] == "0.1.0"
    assert system_info["account_count"] >= 0


def test_default_proxy_is_used_for_unbound_account(client, db_session_factory):
    proxy = client.post(
        "/api/v1/proxies",
        json={
            "protocol": "http",
            "host": "default-proxy.example.com",
            "port": 9000,
            "username": "proxy-user",
            "password": "proxy-pass",
        },
    ).json()
    settings = client.get("/api/v1/settings").json()
    payload = {
        key: value
        for key, value in settings.items()
        if key not in {"id", "updated_at"}
    }
    payload["default_proxy_id"] = proxy["id"]
    assert client.put("/api/v1/settings", json=payload).status_code == 200
    account = client.post(
        "/api/v1/accounts",
        json={"username": "default_proxy_account", "status": "valid"},
    ).json()

    with db_session_factory() as db:
        account_model = db.get(Account, account["id"])
        assert account_model is not None
        effective = resolve_account_proxy(db, account_model)
    assert effective is not None
    assert effective.node.id == proxy["id"]
    assert str(effective.client_config.url) == "http://default-proxy.example.com:9000"
    assert effective.client_config.auth is not None
    assert effective.client_config.auth.login == "proxy-user"


def test_successful_probe_does_not_reenable_manually_disabled_proxy(
    client,
    db_session_factory,
):
    created = client.post(
        "/api/v1/proxies",
        json={"host": "disabled-proxy.example.com", "port": 8080},
    ).json()
    with db_session_factory() as db:
        proxy = db.get(ProxyNode, created["id"])
        assert proxy is not None
        proxy.is_active = False
        proxy.fail_count = 3
        db.commit()
        _record_proxy_result(db, proxy, success=True, latency=50)
        assert proxy.is_active is False
        assert proxy.fail_count == 0
        assert proxy.last_error is None
