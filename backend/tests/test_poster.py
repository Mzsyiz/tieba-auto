import asyncio
import json
from types import SimpleNamespace
from typing import Any

import pytest
from aiohttp import ServerTimeoutError

from app.core import poster


def test_aiotieba_timeout_uses_configured_request_timeout():
    timeout = poster._aiotieba_timeout(47)

    assert timeout.http_acquire_conn == 47
    assert timeout.http_connect == 47
    assert timeout.http_read == 47
    assert timeout.dns_ttl == 60


def test_proxy_request_options_move_credentials_to_basic_auth():
    proxy, auth = poster._proxy_request_options(
        "http://proxy-user:proxy-pass@proxy.example.com:8080"
    )

    assert proxy == "http://proxy.example.com:8080"
    assert auth is not None
    assert auth.login == "proxy-user"
    assert auth.password == "proxy-pass"
    assert poster._proxy_request_options(None) == (None, None)


def test_pc_thread_fields_enable_image_rendering_and_are_signed():
    fields = poster.build_pc_thread_fields(
        "测试吧",
        123,
        "tbs-token",
        "标题",
        "正文\n#(pic,pic-1,640,480)",
        is_pictxt=True,
    )

    assert fields["is_pictxt"] == "1"
    assert json.loads(fields["ext"])["needImage"] == "1"
    unsigned = {key: value for key, value in fields.items() if key != "sign"}
    assert fields["sign"] == poster._pc_sign(unsigned)


def test_aiotieba_retry_recovers_from_connect_timeout(monkeypatch):
    calls = 0

    class Result:
        err = None

    async def operation():
        nonlocal calls
        calls += 1
        if calls == 1:
            result = Result()
            result.err = ServerTimeoutError("Connection timeout")
            return result
        return Result()

    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)

    async def run():
        return await poster._call_aiotieba_with_retry(
            operation,
            stage="获取账号信息",
            timeout=30,
            using_proxy=False,
        )

    result = asyncio.run(run())

    assert isinstance(result, Result)
    assert calls == 2


def test_aiotieba_timeout_message_includes_stage_and_retry_count(monkeypatch):
    async def operation():
        raise ServerTimeoutError("Connection timeout")

    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)

    async def run():
        await poster._call_aiotieba_with_retry(
            operation,
            stage="获取贴吧信息",
            timeout=30,
            using_proxy=True,
        )

    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(run())

    message = str(exc_info.value)
    assert "获取贴吧信息" in message
    assert "已尝试 3 次" in message
    assert "代理池" in message


def test_commit_retries_connect_timeout_before_connection_is_established(monkeypatch):
    post_calls = 0

    class FakeResponse:
        status_code = 200
        status = 200

        async def read(self) -> bytes:
            return b'{"err_code": 0, "data": {"tid": 123}}'

        def json(self) -> dict[str, Any]:
            return {"err_code": 0, "data": {"tid": 123}}

    class FakeRequest:
        def __init__(self, exc: Exception | None = None) -> None:
            self.exc = exc

        async def __aenter__(self) -> FakeResponse:
            if self.exc is not None:
                raise self.exc
            return FakeResponse()

        async def __aexit__(self, exc_type, exc, traceback) -> None:
            return None

    class FakeClient:
        def get(self, *args: Any, **kwargs: Any) -> FakeRequest:
            return FakeRequest()

        def post(self, *args: Any, **kwargs: Any) -> FakeRequest:
            nonlocal post_calls
            assert "content" not in kwargs
            assert args[0] == poster.COMMIT_THREAD_ADD_PC_URL
            assert kwargs["data"]._fields
            post_calls += 1
            if post_calls == 1:
                return FakeRequest(ServerTimeoutError("connection timed out"))
            return FakeRequest()

    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)

    async def run():
        fields = poster.build_pc_thread_fields(
            "test",
            123,
            "tbs",
            "title",
            "body",
            is_pictxt=True,
        )
        return await poster._prewarm_and_commit(
            FakeClient(),  # type: ignore[arg-type]
            {},
            "test",
            fields,
            0,
            0,
            30,
            None,
            False,
        )

    payload = asyncio.run(run())

    assert payload["data"]["tid"] == 123
    assert post_calls == 2


def test_image_upload_retries_connect_timeout(monkeypatch):
    post_calls = 0

    class FakeResponse:
        status = 200

        async def read(self) -> bytes:
            return (
                b'{"error_code": 0, "picId": "pic-123", '
                b'"picInfo": {"originPic": {"width": 640, "height": 480}}}'
            )

        def json(self) -> dict[str, Any]:
            return {
                "error_code": 0,
                "picId": "pic-123",
                "picInfo": {"originPic": {"width": 640, "height": 480}},
            }

    class FakeRequest:
        def __init__(self, exc: Exception | None = None) -> None:
            self.exc = exc

        async def __aenter__(self) -> FakeResponse:
            if self.exc is not None:
                raise self.exc
            return FakeResponse()

        async def __aexit__(self, exc_type, exc, traceback) -> None:
            return None

    class FakeHttpClient:
        def post(self, *args: Any, **kwargs: Any) -> FakeRequest:
            nonlocal post_calls
            post_calls += 1
            if post_calls == 1:
                return FakeRequest(ServerTimeoutError("connection timed out"))
            return FakeRequest()

    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)

    async def run():
        return await poster._upload_image(
            SimpleNamespace(account=SimpleNamespace(tbs="tbs")),  # type: ignore[arg-type]
            FakeHttpClient(),  # type: ignore[arg-type]
            "bduss",
            "stoken",
            "测试吧",
            b"fake-image",
            "test.png",
            "image/png",
            timeout=30,
        )

    uploaded = asyncio.run(run())

    assert uploaded == {
        "pic_id": "pic-123",
        "width": "640",
        "height": "480",
    }
    assert post_calls == 2


def test_publish_thread_passes_request_timeout_to_aiotieba(monkeypatch):
    captured: dict[str, Any] = {}

    class FakeClient:
        def __init__(self, **kwargs: Any) -> None:
            captured.update(kwargs)
            self.account = kwargs["account"]
            self.account.tbs = "tbs"

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback) -> None:
            return None

        async def get_self_info(self):
            return None

        async def get_forum(self, fname: str):
            assert fname == "测试吧"
            return SimpleNamespace(fid=123)

    async def fake_commit(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {"err_code": 0, "data": {"tid": 456}}

    monkeypatch.setattr(poster, "Account", lambda **kwargs: SimpleNamespace(**kwargs))
    monkeypatch.setattr(poster, "Client", FakeClient)
    monkeypatch.setattr(poster, "_prewarm_and_commit", fake_commit)

    async def run():
        return await poster.publish_thread(
            "bduss",
            "stoken",
            "测试吧",
            "标题",
            "正文",
            request_timeout=47,
            prewarm_min=0,
            prewarm_max=0,
        )

    result = asyncio.run(run())

    assert result.success is True
    assert result.tid == 456
    assert captured["timeout"].http_connect == 47
