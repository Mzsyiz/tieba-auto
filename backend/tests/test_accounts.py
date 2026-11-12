def test_create_and_list_account(client):
    created = client.post(
        "/api/v1/accounts",
        json={
            "username": "13800138000",
            "nickname": "测试账号",
            "bduss": "secret-bduss",
            "status": "valid",
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["username"] == "13800138000"
    assert body["status"] == "valid"
    assert body["has_credentials"] is True
    assert "bduss" not in body

    listed = client.get("/api/v1/accounts")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_duplicate_account_conflict(client):
    payload = {"username": "dup@example.com", "status": "pending"}
    assert client.post("/api/v1/accounts", json=payload).status_code == 201
    assert client.post("/api/v1/accounts", json=payload).status_code == 409


def test_filter_by_status(client):
    client.post("/api/v1/accounts", json={"username": "a", "status": "valid"})
    client.post("/api/v1/accounts", json={"username": "b", "status": "disabled"})

    res = client.get("/api/v1/accounts", params={"status": "disabled"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["username"] == "b"


def test_update_and_delete(client):
    created = client.post("/api/v1/accounts", json={"username": "c"}).json()
    account_id = created["id"]

    updated = client.patch(
        f"/api/v1/accounts/{account_id}",
        json={"nickname": "新昵称", "status": "invalid", "status_reason": "cookie 失效"},
    )
    assert updated.status_code == 200
    assert updated.json()["nickname"] == "新昵称"
    assert updated.json()["status"] == "invalid"

    assert client.delete(f"/api/v1/accounts/{account_id}").status_code == 204
    assert client.get(f"/api/v1/accounts/{account_id}").status_code == 404


def test_parse_cookie_variants():
    from app.core.tieba import parse_cookie

    parsed = parse_cookie("BAIDUID=abc; BDUSS=hello-bduss; STOKEN=hello-stoken; OTHER=1")
    assert parsed.bduss == "hello-bduss"
    assert parsed.stoken == "hello-stoken"
    parsed = parse_cookie('{"BDUSS": "json-bduss", "STOKEN": "json-stoken"}')
    assert parsed.bduss == "json-bduss"
    assert parsed.stoken == "json-stoken"

    bare = "a" * 32
    assert parse_cookie(bare).bduss == bare


def test_import_cookie_without_verification(client):
    res = client.post(
        "/api/v1/accounts/import-cookie",
        json={
            "cookie": "BDUSS=import-bduss-123456; STOKEN=import-stoken-123456",
            "name": "导入测试账号",
            "verify": False,
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["username"] == "导入测试账号"
    assert body["has_credentials"] is True
    assert body["status"] == "pending"
    assert "bduss" not in body

    duplicate = client.post(
        "/api/v1/accounts/import-cookie",
        json={"cookie": "BDUSS=import-bduss-123456", "verify": False},
    )
    assert duplicate.status_code == 409


def test_import_cookie_requires_bduss(client):
    res = client.post(
        "/api/v1/accounts/import-cookie",
        json={"cookie": "not-a-cookie", "verify": False},
    )
    assert res.status_code == 400


def test_network_error_during_verify_keeps_valid_status(client, monkeypatch):
    from app.core.tieba import VerifyResult

    account = client.post(
        "/api/v1/accounts",
        json={
            "username": "verify_network_error",
            "bduss": "x" * 192,
            "status": "valid",
        },
    ).json()

    monkeypatch.setattr(
        "app.api.v1.accounts.verify_credentials",
        lambda *args, **kwargs: VerifyResult(
            valid=False,
            status="error",
            error="验证超时，请检查网络",
        ),
    )
    response = client.post(f"/api/v1/accounts/{account['id']}/verify")
    assert response.status_code == 200
    assert response.json()["status"] == "valid"
    assert "验证暂不可用" in response.json()["status_reason"]
