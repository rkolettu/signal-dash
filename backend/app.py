"""FastAPI backend. Run: uvicorn app:app --reload --port 8000"""
import csv, io, json
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import db
from db import conn
from analysis import prices, signals as sig

db.init()
app = FastAPI(title="Signal Dash")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

def _post_row(r, mentions):
    return {"id": r["id"], "official": r["official"], "handle": r["handle"],
            "platform": r["platform"], "posted_at": r["posted_at"],
            "text": r["text"], "url": r["url"], "engagement": r["engagement"],
            "sentiment": r["sentiment"], "mentions": mentions.get(r["id"], [])}

def _load_posts(where="p.flagged=1", params=(), limit=200):
    with conn() as c:
        rows = c.execute(f"""SELECT * FROM posts p WHERE {where}
                             ORDER BY posted_at DESC LIMIT ?""",
                         (*params, limit)).fetchall()
        ids = [r["id"] for r in rows]
        mentions = {}
        if ids:
            q = ",".join("?" * len(ids))
            for m in c.execute(f"SELECT * FROM mentions WHERE post_id IN ({q})", ids):
                mentions.setdefault(m["post_id"], []).append(
                    {"ticker": m["ticker"], "company": m["company"]})
    return [_post_row(r, mentions) for r in rows]

@app.get("/api/feed")
def feed(official: str | None = None, ticker: str | None = None,
         platform: str | None = None, since: str | None = None,
         until: str | None = None, limit: int = Query(100, le=500)):
    where, params = ["p.flagged=1"], []
    if official: where.append("p.official=?"); params.append(official)
    if platform: where.append("p.platform=?"); params.append(platform)
    if since:    where.append("p.posted_at>=?"); params.append(since)
    if until:    where.append("p.posted_at<=?"); params.append(until + "T23:59:59")
    if ticker:
        where.append("p.id IN (SELECT post_id FROM mentions WHERE ticker=?)")
        params.append(ticker.upper())
    return _load_posts(" AND ".join(where), tuple(params), limit)

@app.get("/api/stocks")
def stocks():
    with conn() as c:
        rows = c.execute("""
            SELECT m.ticker, m.company, COUNT(*) AS mentions,
                   ROUND(AVG(p.sentiment), 3) AS avg_sentiment,
                   GROUP_CONCAT(DISTINCT p.official) AS officials,
                   MAX(p.posted_at) AS last_mention
            FROM mentions m JOIN posts p ON p.id=m.post_id
            WHERE p.flagged=1
            GROUP BY m.ticker ORDER BY mentions DESC""").fetchall()
    return [{**dict(r), "officials": r["officials"].split(",")} for r in rows]

@app.get("/api/stocks/{ticker}/chart")
def chart(ticker: str, days: int = Query(90, le=730)):
    ticker = ticker.upper()
    series = prices.series(ticker, days)
    with conn() as c:
        marks = c.execute("""
            SELECT substr(p.posted_at,1,10) AS date, p.official, p.text, p.sentiment
            FROM mentions m JOIN posts p ON p.id=m.post_id
            WHERE m.ticker=? AND p.flagged=1 ORDER BY p.posted_at""",
            (ticker,)).fetchall()
    return {"ticker": ticker, "prices": series,
            "mentions": [dict(r) for r in marks]}

@app.get("/api/signals")
def get_signals(recompute: bool = False):
    if recompute:
        sig.recompute()
    with conn() as c:
        rows = c.execute("SELECT * FROM signals ORDER BY date DESC").fetchall()
    return [{**dict(r), "officials": json.loads(r["officials"])} for r in rows]

@app.get("/api/officials")
def officials_list():
    with conn() as c:
        rows = c.execute("""SELECT official, COUNT(*) AS flagged_posts
                            FROM posts WHERE flagged=1
                            GROUP BY official ORDER BY flagged_posts DESC""").fetchall()
    return [dict(r) for r in rows]

@app.get("/api/export")
def export(fmt: str = "csv"):
    posts = _load_posts(limit=10000)
    rows = []
    for p in posts:
        for m in p["mentions"]:
            perf = prices.around_mention(m["ticker"], p["posted_at"]) or {}
            rows.append({"date": p["posted_at"], "official": p["official"],
                         "platform": p["platform"], "ticker": m["ticker"],
                         "company": m["company"], "sentiment": p["sentiment"],
                         "text": p["text"], **perf})
    if fmt == "json":
        return rows
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=rows[0].keys())
        w.writeheader(); w.writerows(rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=signals.csv"})

@app.post("/api/ingest/{source}")
def ingest(source: str):
    if source == "truth_social":
        from ingest.truth_social import fetch
    elif source == "x":
        from ingest.x_posts import fetch
    else:
        return {"error": "unknown source"}
    inserted, flagged = fetch()
    sig.recompute()
    return {"inserted": inserted, "flagged": flagged}
