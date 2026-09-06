"""Anomaly detection over flagged mentions.

spike:       daily mention count z-score >= 2 vs trailing 30-day baseline
coordinated: >=2 distinct officials mention same ticker same UTC day
Confidence is a rough 0-1 blend; tune against labeled history later.
"""
import datetime as dt
import statistics
from collections import defaultdict
from db import conn, upsert_signal

def recompute(lookback_days: int = 120):
    since = (dt.date.today() - dt.timedelta(days=lookback_days)).isoformat()
    with conn() as c:
        rows = c.execute("""
            SELECT m.ticker, substr(p.posted_at,1,10) AS day, p.official
            FROM mentions m JOIN posts p ON p.id = m.post_id
            WHERE p.flagged = 1 AND p.posted_at >= ?""", (since,)).fetchall()

    daily = defaultdict(lambda: defaultdict(set))  # ticker -> day -> {officials}
    for r in rows:
        daily[r["ticker"]][r["day"]].add(r["official"])

    with conn() as c:
        c.execute("DELETE FROM signals")
        for ticker, days in daily.items():
            counts_by_day = {d: len(offs) for d, offs in days.items()}
            all_days = sorted(counts_by_day)
            for d in all_days:
                offs = sorted(days[d])
                n = counts_by_day[d]
                # coordinated
                if len(offs) >= 2:
                    conf = min(1.0, 0.5 + 0.15 * len(offs))
                    upsert_signal(c, ticker, d, "coordinated", offs, n, round(conf, 2))
                # spike vs trailing 30d
                window = [counts_by_day.get(
                    (dt.date.fromisoformat(d) - dt.timedelta(days=i)).isoformat(), 0)
                    for i in range(1, 31)]
                mu = statistics.mean(window)
                sd = statistics.pstdev(window) or 0.5
                z = (n - mu) / sd
                if z >= 2 and n >= 2:
                    conf = min(1.0, 0.4 + 0.1 * z)
                    upsert_signal(c, ticker, d, "spike", offs, n, round(conf, 2))
