# Signal Dash

Research dashboard tracking explicit stock/company mentions in original posts
by the U.S. President and Cabinet members (Truth Social + X), with sentiment
flagging, anomaly signals, and price-movement correlation.

**Not investment advice.** Correlation between an official's post and a price
move is not causation. Built for research and transparency analysis.

## Quick start (demo mode, no API keys)

```bash
# backend
cd backend
pip install -r requirements.txt
python seed_demo.py            # synthetic fictional posts
uvicorn app:app --reload --port 8000

# frontend (new terminal)
cd frontend
npm install
npm run dev                    # http://localhost:5173 (proxies /api -> :8000)
```

## Offline snapshot

The frontend works without the API. If the backend can't be reached — nothing
listening, a static host with no `/api`, or a sleeping free-tier instance that
hasn't answered within ~12 s — it loads a bundled snapshot of the demo dataset
(`frontend/src/data/demo-snapshot.json`) and says so in the header. If the API
wakes up afterwards, the header offers to switch to live data.

The snapshot is produced by the real pipeline, not written by hand: the
synthetic demo posts go through ticker extraction, VADER and the flag rule in a
throwaway database, and the file holds exactly what the API returns, including
real Yahoo Finance daily closes and the CSV export rows. Only completed trading
sessions are included, so run it after the U.S. market close to include that
day's close:

```bash
cd backend && python export_snapshot.py
```

To build a static site that never calls the API, set
`VITE_DATA_SOURCE=snapshot` at build time.

## Run inside VS Code

The `vscode-extension/` folder packages the dashboard as a VS Code webview.
It auto-starts the backend (preferring `backend/.venv` if present), seeds demo
data on an empty database, and reuses an already-running server on the port.

```bash
cd vscode-extension && npm install && npm run build
```

Then open this repo in VS Code, press **F5** (Run Signal Dash Extension), and
in the new window run **Signal Dash: Open Dashboard** from the Command
Palette. Settings: `signalDash.pythonPath`, `signalDash.port`,
`signalDash.backendPath`. Backend logs appear in the "Signal Dash" output
channel. To install permanently: `npx @vscode/vsce package` in
`vscode-extension/`, then "Extensions: Install from VSIX".

## Going live

1. Fill in verified handles in `backend/officials.py`.
2. Truth Social: `pip install git+https://github.com/stanfordio/truthbrush.git`
   then `export TRUTHSOCIAL_USERNAME=... TRUTHSOCIAL_PASSWORD=...` (throwaway account).
3. X: sign up at twitterapi.io ($1 trial credit), `export TWITTERAPI_IO_KEY=...`
4. Trigger ingestion: `curl -X POST localhost:8000/api/ingest/truth_social`
   and `/api/ingest/x`. Schedule via cron every 15–30 min.
5. Delete `backend/signal.db` first to clear demo data.

## Costs

| Source | Cost |
|---|---|
| Truth Social (truthbrush) | $0 |
| X via twitterapi.io | ~$1–2/mo at this volume |
| X via official pay-per-use | ~$30–40/mo |
| yfinance prices | $0 |
| Hosting (Render free + Vercel) | $0 |

See `BUILD_PROMPT.md` for architecture details and the backlog.
