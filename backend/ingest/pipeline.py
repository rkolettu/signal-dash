"""Shared processing: raw post dict -> analyzed row in DB.

Every fetcher normalizes to:
  {official, handle, platform, posted_at (ISO UTC), text, url, engagement}
"""
import re
from db import conn, insert_post, insert_mention
from analysis import tickers, sentiment

_TAG = re.compile(r"<[^>]+>")

def clean(text: str) -> str:
    return _TAG.sub(" ", text or "").replace("&amp;", "&").strip()

def process(raw_posts):
    """Analyze + store. Returns (inserted, flagged) counts."""
    inserted = flagged = 0
    with conn() as c:
        for p in raw_posts:
            text = clean(p["text"])
            if not text:
                continue
            mentions = tickers.extract(text)
            comp = sentiment.score(text)
            flag = sentiment.should_flag(text, bool(mentions), comp)
            pid = insert_post(c, official=p["official"], handle=p["handle"],
                              platform=p["platform"], posted_at=p["posted_at"],
                              text=text, url=p.get("url"),
                              engagement=p.get("engagement", 0),
                              sentiment=comp, flagged=1 if flag else 0)
            if pid is None:
                continue  # dedup hit
            inserted += 1
            if flag:
                flagged += 1
                for m in mentions:
                    insert_mention(c, pid, m["ticker"], m["company"], m["match_text"])
    return inserted, flagged
