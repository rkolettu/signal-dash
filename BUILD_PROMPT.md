# Signal Dash — Build Prompt (v2, corrected)

Use this as the project brief when iterating with Claude Code. It replaces the
original prompt, which assumed a free Twitter API tier that no longer exists.

## What changed from v1 and why

1. **X API free tier is discontinued (Feb 2026).** New developers get
   pay-per-use only (~$0.005/post read, no free read allowance). The old
   "450K tweets/month free" figure is from the pre-2023 API. Legacy
   Basic/Pro tiers are closed to new signups.
2. **Data source strategy (near-zero cost):**
   - **Truth Social (primary, free):** `truthbrush` library, unofficial
     Mastodon-style API. The President posts here primarily.
   - **X (cabinet members, ~$1–2/mo):** twitterapi.io third-party API
     (~$0.15/1,000 tweets, $1 trial credit) — or official pay-per-use
     (~$30–40/mo at this polling volume) if you want first-party data.
   - **Facebook: dropped.** No viable free/cheap read path.
3. **No scraping X directly.** Login walls + ToS + IP bans make it not worth it.

## Current architecture (already built — MVP scaffold in this repo)

```
backend/  (Python 3.11+, FastAPI, SQLite)
  db.py                  schema: posts, mentions, signals, price_cache; content-hash dedup
  officials.py           registry of tracked accounts (FILL IN REAL HANDLES)
  ingest/pipeline.py     normalize -> extract tickers -> VADER -> flag -> store
  ingest/truth_social.py truthbrush fetcher (original posts only, rate-limited)
  ingest/x_posts.py      twitterapi.io fetcher (swap-in point for official API)
  analysis/tickers.py    SEC company_tickers.json + cashtag/name matching,
                         ambiguous-ticker blocklist (bare "IT", "GO" etc. need $)
  analysis/sentiment.py  VADER compound + promotional-phrase regex; flag rule:
                         mention AND (compound >= 0.25 OR promo phrase)
  analysis/prices.py     yfinance daily closes, SQLite cache, +1d/+7d/+30d returns
  analysis/signals.py    spike (z>=2 vs trailing 30d) + coordinated (>=2 officials/day)
  app.py                 endpoints: /api/feed /api/stocks /api/stocks/{t}/chart
                         /api/signals /api/officials /api/export /api/ingest/{source}
  seed_demo.py           synthetic data so UI works with zero keys
frontend/ (Vite + React + Recharts)
  Feed w/ filters, stocks summary table, price chart w/ mention markers,
  signals list, CSV export. Dark ledger theme (styles.css tokens).
```

## Backlog (in priority order)

1. Fill `officials.py` with verified real handles (impersonation is rampant —
   verify each account manually).
2. Scheduler: APScheduler or cron hitting `/api/ingest/*` every 15–30 min.
3. Intraday prices: yfinance `interval="5m"` for mentions <60 days old,
   fall back to daily. Extend `/api/stocks/{t}/chart` with a `1D/5D` toggle.
4. Sentiment upgrade path: label ~200 real posts; if VADER accuracy <80%,
   fine-tune DistilBERT and swap behind `sentiment.score()`.
5. Earnings-date proximity flag in signals (yfinance `get_earnings_dates`).
6. Deploy: backend on Render free tier (sleeps after 15 min — fine for
   research cadence) or run locally; frontend on Vercel/Netlify. Set
   `VITE` proxy target or CORS origin accordingly.

## Constraints & conventions

- SQLite only; no server DB until data outgrows it (~years away at this volume).
- Explicit mentions only: cashtags, unambiguous bare tickers, exact company
  names. Never infer from "big tech" / "the auto industry".
- Original posts only — skip replies, retweets/reblogs.
- Every fetcher must isolate failures per-account (one dead handle can't
  kill the run) and normalize to the pipeline dict shape.
- This is a research/transparency tool. Not investment advice; price
  correlation ≠ causation, and the README says so.

## Success criteria (revised)

- Ingestion cycle completes in <5 min for full roster.
- Sentiment flagging >80% precision on a manually labeled sample.
- Total operating cost <$5/mo (twitterapi.io route).
- Dedup: zero duplicate posts across repeated polls.
