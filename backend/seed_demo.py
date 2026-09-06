"""Seed synthetic demo data so the dashboard renders before any live
ingestion is wired up. All posts are FICTIONAL. Run: python seed_demo.py
"""
import datetime as dt
import random
import db
from ingest.pipeline import process

random.seed(42)
OFFICIALS = ["President", "Secretary of Commerce", "Secretary of Treasury",
             "Secretary of Defense", "Vice President"]
TEMPLATES = [
    ("${t} is doing an incredible job. Great American company, highly recommend!", 1),
    ("{c} just announced record earnings. Winning!", 1),
    ("Met with the {c} team today -- bullish on what they're building for America.", 1),
    ("Big things coming from {c}. Best in class!", 1),
    ("Discussed supply chains with industry leaders today.", 0),  # no mention
    ("{c} is a disaster. Sad!", 0),  # mention but negative -> not flagged
]
STOCKS = [("TSLA", "Tesla"), ("BA", "Boeing"), ("LMT", "Lockheed Martin"),
          ("PLTR", "Palantir"), ("INTC", "Intel"), ("F", "Ford Motor")]

def main():
    db.init()
    raw = []
    now = dt.datetime.now(dt.timezone.utc)
    for i in range(80):
        official = random.choice(OFFICIALS)
        tmpl, _ = random.choice(TEMPLATES)
        t, c = random.choice(STOCKS)
        posted = now - dt.timedelta(days=random.randint(0, 60),
                                    hours=random.randint(0, 23))
        raw.append({
            "official": official,
            "handle": official.lower().replace(" ", "_"),
            "platform": random.choice(["truth_social", "x"]),
            "posted_at": posted.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "text": tmpl.format(t=t, c=c),
            "url": None,
            "engagement": random.randint(500, 90000),
        })
    # forced coordinated cluster: 3 officials, same ticker, same day
    day_base = (now - dt.timedelta(days=5)).strftime("%Y-%m-%dT12:0{}:00Z")
    for i, off in enumerate(OFFICIALS[:3]):
        raw.append({"official": off, "handle": off.lower().replace(" ", "_"),
                    "platform": "x", "posted_at": day_base.format(i),
                    "text": "Palantir $PLTR is leading the way. Incredible company!",
                    "url": None, "engagement": 40000})
    inserted, flagged = process(raw)
    from analysis import signals
    signals.recompute()
    print(f"Seeded {inserted} posts, {flagged} flagged.")

if __name__ == "__main__":
    main()
