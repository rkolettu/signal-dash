import asyncio
import csv
import io

import pytest

import db
from analysis import prices


@pytest.fixture
def app(tmp_path, monkeypatch):
    # app seeds its database on import; keep that out of the real one.
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    import app as backend

    posts = [
        {"posted_at": "2026-09-28T14:00:00", "official": "A", "platform": "x", "text": "New listing",
         "sentiment": 0.1, "mentions": [{"ticker": "NEWCO", "company": "NewCo"}]},
        {"posted_at": "2026-09-01T14:00:00", "official": "B", "platform": "x", "text": "Boeing, great",
         "sentiment": 0.6, "mentions": [{"ticker": "BA", "company": "BOEING CO"}]},
    ]
    monkeypatch.setattr(backend, "_load_posts", lambda **kw: posts)
    perf = {"BA": {"price_at_post": 200.0, "ret_1d": 1.0, "ret_7d": -2.0, "ret_30d": None}}
    monkeypatch.setattr(prices, "around_mention", lambda t, d: perf.get(t))
    return backend


def body(response):
    async def read():
        return "".join([c async for c in response.body_iterator])
    return asyncio.run(read())


def read_csv(response):
    return list(csv.DictReader(io.StringIO(body(response))))


def test_csv_keeps_price_columns_when_first_row_has_none(app):
    rows = read_csv(app.export(fmt="csv"))
    assert list(rows[0]) == app.EXPORT_FIELDS
    assert rows[0]["ticker"] == "NEWCO" and rows[0]["price_at_post"] == ""
    assert rows[1]["price_at_post"] == "200.0" and rows[1]["ret_7d"] == "-2.0"


def test_json_rows_share_one_shape(app):
    rows = app.export(fmt="json")
    assert all(list(r) == app.EXPORT_FIELDS for r in rows)
    assert rows[0]["price_at_post"] is None


def test_empty_csv_still_has_a_header(app, monkeypatch):
    monkeypatch.setattr(app, "_load_posts", lambda **kw: [])
    assert body(app.export(fmt="csv")).strip() == ",".join(app.EXPORT_FIELDS)
