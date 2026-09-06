"""yfinance price data with SQLite caching.

Daily closes only in MVP (intraday from yfinance is spotty beyond 60 days;
add it later behind the same interface). All returns are % vs the close
on/just before the mention date.
"""
import datetime as dt
import yfinance as yf
from db import conn

def _fetch_range(ticker: str, start: dt.date, end: dt.date):
    """Return {date_iso: close}, cache-first."""
    with conn() as c:
        rows = c.execute(
            "SELECT date, close FROM price_cache WHERE ticker=? AND date>=? AND date<=?",
            (ticker, start.isoformat(), end.isoformat())).fetchall()
    cached = {r["date"]: r["close"] for r in rows}
    # crude completeness check: expect ~5 trading days per 7 calendar days
    expected = max(1, int((end - start).days * 5 / 7) - 3)
    if len(cached) >= expected:
        return cached
    try:
        hist = yf.Ticker(ticker).history(start=start.isoformat(),
                                         end=(end + dt.timedelta(days=1)).isoformat(),
                                         interval="1d", auto_adjust=True)
    except Exception:
        return cached
    if hist is None or hist.empty:
        return cached
    out = {}
    with conn() as c:
        for idx, row in hist.iterrows():
            d = idx.date().isoformat()
            out[d] = float(row["Close"])
            c.execute("INSERT OR REPLACE INTO price_cache (ticker, date, close) VALUES (?,?,?)",
                      (ticker, d, out[d]))
    return out

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
