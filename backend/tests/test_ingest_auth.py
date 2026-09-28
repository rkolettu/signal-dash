from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import db


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    import app as backend
    return backend


def call(app, host, source="nope", authorization=None):
    request = SimpleNamespace(client=SimpleNamespace(host=host))
    with pytest.raises(HTTPException) as e:
        app.ingest(source, request, authorization)
    return e.value.status_code


def test_remote_calls_need_a_token(app, monkeypatch):
    monkeypatch.setattr(app, "INGEST_TOKEN", None)
    assert call(app, "10.0.0.7", "x") == 403
    assert call(app, "127.0.0.1") == 404  # local is allowed through to the source check


def test_token_is_checked_when_set(app, monkeypatch):
    monkeypatch.setattr(app, "INGEST_TOKEN", "s3cret")
    assert call(app, "127.0.0.1", "x") == 401
    assert call(app, "10.0.0.7", "x", "Bearer wrong") == 401
    assert call(app, "10.0.0.7", "nope", "Bearer s3cret") == 404
