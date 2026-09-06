"""SQLite layer. File-based, zero config."""
import sqlite3, hashlib, json, os
from contextlib import contextmanager

DB_PATH = os.environ.get("SIGNAL_DB", os.path.join(os.path.dirname(__file__), "signal.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  content_hash TEXT UNIQUE,          -- dedup by content+author+date
  official TEXT NOT NULL,            -- display name
  handle TEXT NOT NULL,
  platform TEXT NOT NULL,            -- truth_social | x | manual
  posted_at TEXT NOT NULL,           -- ISO 8601 UTC
  text TEXT NOT NULL,
  url TEXT,
  engagement INTEGER DEFAULT 0,
  sentiment REAL,                    -- VADER compound [-1, 1]
  flagged INTEGER DEFAULT 0          -- 1 if >=1 mention + positive/promotional
);
CREATE INDEX IF NOT EXISTS idx_posts_time ON posts(posted_at);
CREATE INDEX IF NOT EXISTS idx_posts_official ON posts(official);

CREATE TABLE IF NOT EXISTS mentions (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  company TEXT NOT NULL,
  match_text TEXT                    -- literal string that matched
);
CREATE INDEX IF NOT EXISTS idx_mentions_ticker ON mentions(ticker);

CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,                -- YYYY-MM-DD
  kind TEXT NOT NULL,                -- spike | coordinated
  officials TEXT NOT NULL,           -- JSON list
  mention_count INTEGER,
  confidence REAL,
  UNIQUE(ticker, date, kind)
);

CREATE TABLE IF NOT EXISTS price_cache (
  ticker TEXT, date TEXT, close REAL,
  PRIMARY KEY (ticker, date)
);
"""

@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()

def init():
    with conn() as c:
        c.executescript(SCHEMA)

def content_hash(handle: str, posted_at: str, text: str) -> str:
    return hashlib.sha256(f"{handle}|{posted_at}|{text}".encode()).hexdigest()

def insert_post(c, *, official, handle, platform, posted_at, text, url=None,
                engagement=0, sentiment=None, flagged=0):
    h = content_hash(handle, posted_at, text)
    cur = c.execute(
        """INSERT OR IGNORE INTO posts
           (content_hash, official, handle, platform, posted_at, text, url, engagement, sentiment, flagged)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (h, official, handle, platform, posted_at, text, url, engagement, sentiment, flagged))
    if cur.rowcount == 0:
        return None  # duplicate
    return cur.lastrowid

def insert_mention(c, post_id, ticker, company, match_text):
    c.execute("INSERT INTO mentions (post_id, ticker, company, match_text) VALUES (?,?,?,?)",
              (post_id, ticker, company, match_text))

def upsert_signal(c, ticker, date, kind, officials, mention_count, confidence):
    c.execute("""INSERT INTO signals (ticker, date, kind, officials, mention_count, confidence)
                 VALUES (?,?,?,?,?,?)
                 ON CONFLICT(ticker, date, kind) DO UPDATE SET
                   officials=excluded.officials,
                   mention_count=excluded.mention_count,
                   confidence=excluded.confidence""",
              (ticker, date, kind, json.dumps(officials), mention_count, confidence))
