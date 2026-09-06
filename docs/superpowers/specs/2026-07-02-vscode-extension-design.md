# Signal Dash VS Code Extension — Design

Date: 2026-07-02 · Status: approved (Approach A)

## Goal

Open the existing Signal Dash web dashboard (feed, price chart, stocks table,
signals) inside a VS Code webview panel with one command, auto-starting the
Python backend and seeding demo data on first run. The browser workflow
(`vite dev` + manual uvicorn) keeps working unchanged.

## Approach (chosen: A — reuse the Vite build in a webview)

The extension bundles the built React app (`frontend/dist`) into its own
`media/dist` folder and serves it from a webview. The webview fetches the
FastAPI backend at `http://localhost:<port>` directly (CORS already `*`).
Rejected: B (iframe the backend-served app — iframe quirks, backend change for
a frontend concern) and C (rewrite UI with VS Code toolkit — second UI
codebase).

## Layout

```
vscode-extension/
  package.json           manifest: command, settings, build scripts
  tsconfig.json
  src/extension.ts       activation, command, disposal
  src/backendManager.ts  reuse-or-spawn uvicorn, seed on empty DB, health poll
  src/dashboardPanel.ts  singleton webview, asset URI rewrite, CSP, API base inject
  scripts/copy-frontend.mjs  vite build + copy dist -> media/dist
  media/dist/            (generated, gitignored)
.vscode/launch.json      F5 Extension Development Host
```

## Behavior

- Command **Signal Dash: Open Dashboard** (`signal-dash.openDashboard`).
- Backend resolution: health-check `GET /api/officials` on the configured
  port. Healthy → reuse (manual uvicorn still works). Connection refused →
  spawn `python -m uvicorn app:app --port <port>` in `backend/`, after running
  `seed_demo.py` if `signal.db` is absent. Poll health up to 15 s.
- Backend directory: `signalDash.backendPath` setting if set; else first
  workspace folder containing `backend/app.py`; else `../backend` relative to
  the extension.
- Settings: `signalDash.pythonPath` (default `python3`), `signalDash.port`
  (default `8000`), `signalDash.backendPath` (default empty).
- Frontend change: `api.js` prefixes all fetches with
  `window.__SIGNAL_DASH_API__ ?? ''`; the stray `fetch('/api/officials')` in
  `App.jsx` moves into `api.js`. Browser build unaffected (global undefined).
- Webview HTML: rewrite `/assets/*` to webview URIs, inject nonce'd script
  setting the API base, CSP allowing `connect-src http://localhost:<port>`
  plus Google Fonts (styles/fonts used by index.html).
- Backend process is kept alive across panel close/reopen; killed on
  extension deactivate. stdout/stderr → "Signal Dash" output channel.

## Error handling

- Python or deps missing (verified via `python -c "import fastapi, uvicorn"`)
  → notification with `pip install -r requirements.txt` fix and a button to
  open settings.
- Health check never passes → error naming the port and `signalDash.port`.
- Child process exits unexpectedly → notification with Restart button.

## Testing

Manual via F5 Extension Development Host: fresh-DB seed path, all four UI
sections render, reuse-existing-server path, crash-restart notification.
No automated extension tests for the MVP (thin plumbing; backend untouched).
Package for daily use with `vsce package` → Install from VSIX.
