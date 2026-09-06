"""X ingestion via twitterapi.io (third-party, ~$0.15 per 1,000 tweets read;
$1 trial credit on signup). At ~25 officials polled a few times daily this
runs on pennies per month.

Auth: export TWITTERAPI_IO_KEY=...

Alternative: official X API pay-per-use ($0.005/read, ~$30-40/mo at this
volume). Swap the endpoint + auth here; the normalized dict stays the same.
"""
import os, time
import requests
from officials import by_platform
from ingest.pipeline import process

BASE = "https://api.twitterapi.io/twitter/user/last_tweets"
SLEEP = 3

def fetch(limit_per_account: int = 20):
    key = os.environ["TWITTERAPI_IO_KEY"]
    raw = []
    for name, handle in by_platform("x"):
        try:
            r = requests.get(BASE, params={"userName": handle},
                             headers={"X-API-Key": key}, timeout=20)
            r.raise_for_status()
            tweets = (r.json().get("data") or {}).get("tweets", [])[:limit_per_account]
            for t in tweets:
                if t.get("isReply") or t.get("retweeted_tweet"):
                    continue  # original posts only
                raw.append({
                    "official": name,
                    "handle": handle,
                    "platform": "x",
                    "posted_at": t["createdAt"],
                    "text": t.get("text", ""),
                    "url": t.get("url"),
                    "engagement": (t.get("likeCount", 0) + t.get("retweetCount", 0)),
                })
        except Exception as e:
            print(f"[x] {handle} failed: {e}")
        time.sleep(SLEEP)
    return process(raw)

if __name__ == "__main__":
    import db; db.init()
    print(fetch())
