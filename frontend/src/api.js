// Three ways BASE gets set, checked in order:
//  1. window.__SIGNAL_DASH_API__ — injected by the VS Code extension webview.
//  2. VITE_API_BASE_URL — set at build time on Vercel to the deployed
//     backend's URL, since production frontend and backend live on
//     different domains with no dev proxy between them.
//  3. '' — local dev, where vite.config.js proxies /api to localhost:8000.
const BASE =
  (typeof window !== 'undefined' && window.__SIGNAL_DASH_API__) ||
  import.meta.env.VITE_API_BASE_URL ||
  ''

const q = (params) => {
  const s = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString()
  return s ? `?${s}` : ''
}
export const getFeed      = (f = {})       => fetch(`${BASE}/api/feed${q(f)}`).then(r => r.json())
export const getStocks    = ()             => fetch(`${BASE}/api/stocks`).then(r => r.json())
export const getChart     = (t, days = 90) => fetch(`${BASE}/api/stocks/${t}/chart?days=${days}`).then(r => r.json())
export const getSignals   = ()             => fetch(`${BASE}/api/signals`).then(r => r.json())
export const getOfficials = ()             => fetch(`${BASE}/api/officials`).then(r => r.json())
export const exportUrl    = `${BASE}/api/export?fmt=csv`
