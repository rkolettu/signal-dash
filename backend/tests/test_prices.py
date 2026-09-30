import datetime as dt

import pandas as pd
import pytest

import db
from analysis import prices

NY = "America/New_York"
FRI, MON, TUE = dt.date(2026, 9, 25), dt.date(2026, 9, 28), dt.date(2026, 9, 29)
# the full trading week before, so ranges look complete to the cache check
WEEK = {dt.date(2026, 9, d): 95.0 + d - 21 for d in range(21, 25)}


class FakeYF:
    """Stands in for yfinance: daily bars indexed in exchange time."""

    def __init__(self):
        self.bars = {}
        self.calls = 0

    def Ticker(self, ticker):
        fake = self

        class _T:
            def history(self, start, end, interval, auto_adjust):
                fake.calls += 1
                days = [d for d in sorted(fake.bars) if start <= d.isoformat() < end]
                index = pd.DatetimeIndex([pd.Timestamp(d).tz_localize(NY) for d in days])
                return pd.DataFrame({"Close": [fake.bars[d] for d in days]}, index=index)

        return _T()


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    db.init()
    fake = FakeYF()
    monkeypatch.setattr(prices, "yf", fake)
    monkeypatch.setattr(prices, "_synced", {})
    clock = {"now": None}
    monkeypatch.setattr(prices, "_now_ny", lambda: clock["now"])
    return fake, clock


def at(day, hh, mm=0):
    return dt.datetime(day.year, day.month, day.day, hh, mm)


def cached_rows():
    with db.conn() as c:
        return {r["date"]: r["close"] for r in c.execute("SELECT date, close FROM price_cache")}


def test_last_final_session():
    assert prices.last_final_session(at(MON, 11)) == FRI  # Monday, market open
    assert prices.last_final_session(at(MON, 16, 30)) == MON  # Monday, after the close
    assert prices.last_final_session(at(dt.date(2026, 9, 27), 12)) == FRI  # Sunday


def test_session_in_progress_is_not_cached_or_returned(env):
    fake, clock = env
    fake.bars = {**WEEK, FRI: 100.0, MON: 103.7}  # Monday's bar is a live intraday price
    clock["now"] = at(MON, 11)
    data = prices._fetch_range("TSLA", FRI - dt.timedelta(days=5), MON)
    assert MON.isoformat() not in data and data[FRI.isoformat()] == 100.0
    assert MON.isoformat() not in cached_rows()


def test_cache_picks_up_the_final_close(env):
    fake, clock = env
    fake.bars = {**WEEK, FRI: 100.0, MON: 103.7}
    clock["now"] = at(MON, 11)
    prices._fetch_range("TSLA", FRI - dt.timedelta(days=5), MON)
    # after the close the same request re-fetches and stores the real close
    fake.bars[MON] = 102.9
    clock["now"] = at(MON, 17)
    data = prices._fetch_range("TSLA", FRI - dt.timedelta(days=5), MON)
    assert data[MON.isoformat()] == 102.9
    assert cached_rows()[MON.isoformat()] == 102.9
    # and later requests for that session are served from the cache
    calls = fake.calls
    prices._fetch_range("TSLA", FRI - dt.timedelta(days=5), MON)
    assert fake.calls == calls


def test_holiday_is_fetched_once(env):
    fake, clock = env
    fake.bars = {**WEEK, FRI: 100.0}  # Monday is a market holiday: no bar at all
    clock["now"] = at(MON, 18)
    prices._fetch_range("TSLA", FRI - dt.timedelta(days=5), MON)
    calls = fake.calls
    prices._fetch_range("TSLA", FRI - dt.timedelta(days=5), MON)
    assert fake.calls == calls


def test_around_mention_shape_and_base(env):
    fake, clock = env
    fake.bars = {**WEEK, FRI: 100.0, MON: 110.0}
    clock["now"] = at(MON, 11)  # a mention during Monday's session
    out = prices.around_mention("TSLA", f"{MON.isoformat()}T14:00:00Z")
    # base is Friday's close: Monday's close doesn't exist yet
    assert out == {"price_at_post": 100.0, "ret_1d": None, "ret_7d": None, "ret_30d": None}
    clock["now"] = at(TUE, 17)
    fake.bars[MON] = 110.0
    fake.bars[TUE] = 121.0
    out = prices.around_mention("TSLA", f"{MON.isoformat()}T14:00:00Z")
    assert out["price_at_post"] == 110.0 and out["ret_1d"] == 10.0


def test_unpublished_close_is_skipped_and_retried(env):
    fake, clock = env
    # After the close, Yahoo lists Monday but hasn't published its close yet.
    fake.bars = {**WEEK, FRI: 100.0, MON: float("nan")}
    clock["now"] = at(MON, 17)
    data = prices._fetch_range("TSLA", FRI - dt.timedelta(days=5), MON)
    assert MON.isoformat() not in data and data[FRI.isoformat()] == 100.0
    assert MON.isoformat() not in cached_rows()
    assert all(r["close"] == r["close"] for r in prices.series("TSLA", 10))  # no NaN
    # the next request asks again and gets the real close
    fake.bars[MON] = 102.9
    data = prices._fetch_range("TSLA", FRI - dt.timedelta(days=5), MON)
    assert data[MON.isoformat()] == 102.9
