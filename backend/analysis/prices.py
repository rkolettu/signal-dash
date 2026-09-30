"""yfinance price data with SQLite caching.

Daily closes only in MVP (intraday from yfinance is spotty beyond 60 days;
add it later behind the same interface). All returns are % vs the close
on/just before the mention date.

During market hours yfinance's newest daily row is the session still in
progress -- a moving intraday price, not a close. Rows are only cached or
returned once their session has closed, and a ticker is re-fetched once
after each new close so the cache picks up the final price.

Yahoo sometimes lists a session before its close is published, with a NaN
close. Those rows are skipped (never cached or returned) and the ticker is
asked again on the next request, until the real close arrives.
"""
import datetime as dt
import math
import yfinance as yf
from db import conn

try:
    from zoneinfo import ZoneInfo
    _NY = ZoneInfo("America/New_York")
except Exception:  # no tz database available
    _NY = None

# U.S. equities close at 16:00 New York time; allow a few minutes for the
# final closing print. Early-close days are simply treated as final at 16:20.
CLOSE_FINAL = dt.time(16, 20)

# ticker -> latest final session it has been fetched for (this process)
_synced = {}

def _now_ny():
    if _NY is not None:
        return dt.datetime.now(_NY)
    # Without tz data, use UTC-5: the 16:20 cutoff then falls at 21:20 UTC,
    # after the close in both EST (21:00 UTC) and EDT (20:00 UTC).
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(hours=5)

def last_final_session(now=None):
    """Most recent weekday whose close is final. Market holidays aren't
    modelled; on one, the day before is still the latest real close."""
    now = now or _now_ny()
    d = now.date()
    if d.weekday() >= 5 or now.time() < CLOSE_FINAL:
        d -= dt.timedelta(days=1)
    while d.weekday() >= 5:
        d -= dt.timedelta(days=1)
    return d

def _fetch_range(ticker: str, start: dt.date, end: dt.date):
    """Return {date_iso: close} for completed sessions only, cache-first."""
    final = last_final_session()
    upto = min(end, final)
    with conn() as c:
        rows = c.execute(
            "SELECT date, close FROM price_cache WHERE ticker=? AND date>=? AND date<=?",
            (ticker, start.isoformat(), upto.isoformat())).fetchall()
    cached = {r["date"]: r["close"] for r in rows if _is_price(r["close"])}
    # crude completeness check: expect ~5 trading days per 7 calendar days,
    # counting only up to the last completed session
    expected = max(1, int((upto - start).days * 5 / 7) - 3)
    # a range that reaches the newest close is re-fetched once per new close
    stale = end >= final and _synced.get(ticker) != final
    if len(cached) >= expected and not stale:
        return cached
    try:
        hist = yf.Ticker(ticker).history(start=start.isoformat(),
                                         end=(end + dt.timedelta(days=1)).isoformat(),
                                         interval="1d", auto_adjust=True)
    except Exception:
        return cached
    if hist is None or hist.empty:
        _synced[ticker] = final
        return cached
    out = {}
    unpublished = False
    with conn() as c:
        for idx, row in hist.iterrows():
            d = idx.date()
            if d > final:  # session still trading: not a close yet
                continue
            if not _is_price(row["Close"]):  # listed, but no close published yet
                unpublished = unpublished or d == final
                continue
            out[d.isoformat()] = float(row["Close"])
            c.execute("INSERT OR REPLACE INTO price_cache (ticker, date, close) VALUES (?,?,?)",
                      (ticker, d.isoformat(), out[d.isoformat()]))
    if not unpublished:
        _synced[ticker] = final
    return out

def _is_price(v):
    try:
        return v is not None and math.isfinite(v) and v > 0
    except TypeError:
        return False

def series(ticker: str, days: int = 90):
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    data = _fetch_range(ticker, start, end)
    return sorted(({"date": d, "close": p} for d, p in data.items()),
                  key=lambda r: r["date"])

def _close_on_or_before(data: dict, d: dt.date):
    for back in range(7):
        k = (d - dt.timedelta(days=back)).isoformat()
        if k in data:
            return data[k]
    return None

def _close_on_or_after(data: dict, d: dt.date):
    for fwd in range(7):
        k = (d + dt.timedelta(days=fwd)).isoformat()
        if k in data:
            return data[k]
    return None

def around_mention(ticker: str, mention_date: str):
    """Base price + %returns at +1d, +7d, +30d after mention_date."""
    d = dt.date.fromisoformat(mention_date[:10])
    data = _fetch_range(ticker, d - dt.timedelta(days=10), d + dt.timedelta(days=37))
    base = _close_on_or_before(data, d)
    if base is None:
        return None
    def ret(offset):
        p = _close_on_or_after(data, d + dt.timedelta(days=offset))
        return round((p / base - 1) * 100, 2) if p else None
    return {"price_at_post": round(base, 2),
            "ret_1d": ret(1), "ret_7d": ret(7), "ret_30d": ret(30)}
