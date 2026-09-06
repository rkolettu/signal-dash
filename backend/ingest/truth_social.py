"""Truth Social ingestion via truthbrush (open-source, Mastodon-style API).

Install: pip install git+https://github.com/stanfordio/truthbrush.git
Auth:    export TRUTHSOCIAL_USERNAME=... TRUTHSOCIAL_PASSWORD=...
         (a throwaway account; do not use anything you care about)

Rate limiting: sleep between accounts. Endpoints are unofficial and can
break without notice -- keep this module isolated so failures don't take
down the rest of ingestion.
"""
import time
from officials import by_platform
from ingest.pipeline import process

SLEEP_BETWEEN_ACCOUNTS = 8  # seconds

def fetch(limit_per_account: int = 40):
    from truthbrush.api import Api  # lazy import; optional dependency
    api = Api()
    raw = []
    for name, handle in by_platform("truth_social"):
        try:
            for status in api.pull_statuses(handle, replies=False):
                if status.get("reblog"):        # original posts only
                    continue
                raw.append({
                    "official": name,
                    "handle": handle,
                    "platform": "truth_social",
                    "posted_at": status["created_at"],
                    "text": status.get("content", ""),
                    "url": status.get("url"),
                    "engagement": (status.get("favourites_count", 0)
                                   + status.get("reblogs_count", 0)),
                })
                if sum(1 for r in raw if r["handle"] == handle) >= limit_per_account:
                    break
        except Exception as e:
            print(f"[truth_social] {handle} failed: {e}")
        time.sleep(SLEEP_BETWEEN_ACCOUNTS)
    return process(raw)

if __name__ == "__main__":
    import db; db.init()
    print(fetch())
