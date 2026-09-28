"""Export the demo dataset as a static snapshot for the frontend.

The dashboard falls back to this file when the API can't be reached, so it
still works as a static site. Nothing here is hand-made: the synthetic demo
posts from seed_demo.py go through the real pipeline (ticker extraction,
VADER, flag rule, anomaly signals) in a throwaway database, and the file
holds exactly what the API endpoints return -- including daily closes from
Yahoo Finance and the CSV export rows with +1/+7/+30-day changes.

Run: python export_snapshot.py   (needs network access for SEC + yfinance)
Prices only include completed sessions (see analysis/prices.py), so a run
during market hours ends at the previous close; run after the U.S. close to
include that day.
"""
import datetime as dt
import json
import os
import sys
import tempfile

# A fresh database so the snapshot never mixes with local or live data.
os.environ["SIGNAL_DB"] = os.path.join(tempfile.mkdtemp(), "snapshot.db")

import app  # noqa: E402  (seeds the demo posts on first boot of an empty DB)

OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "data", "demo-snapshot.json")


def main():
    feed = app.feed(official=None, ticker=None, platform=None, since=None, until=None, limit=500)
    stocks = app.stocks()
    signals = app.get_signals(recompute=False)

    today = dt.date.today()
    charts = {}
    for s in stocks:
        first = min(p["posted_at"][:10] for p in feed if any(m["ticker"] == s["ticker"] for m in p["mentions"]))
        days = min(730, (today - dt.date.fromisoformat(first)).days + 60)
        charts[s["ticker"]] = app.chart(s["ticker"], days=days)
        print(f"  {s['ticker']:<6} {len(charts[s['ticker']]['prices'])} daily closes")

    rows = app.export(fmt="json")

    snapshot = {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "about": "Synthetic demo posts run through the Signal Dash pipeline; "
                 "prices are real daily closes from Yahoo Finance via yfinance.",
        "feed": feed,
        "stocks": stocks,
        "signals": signals,
        "charts": charts,
        "export": rows,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(snapshot, f, separators=(",", ":"))
    missing = [t for t, c in charts.items() if not c["prices"]]
    print(f"Wrote {os.path.relpath(OUT)}: {len(feed)} posts, {len(stocks)} tickers, "
          f"{len(signals)} signals, {len(rows)} export rows")
    if missing:
        print(f"No prices returned for: {', '.join(missing)}", file=sys.stderr)


if __name__ == "__main__":
    main()
