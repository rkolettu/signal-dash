// In the browser build this is '' (vite dev proxy / same origin); inside the
// VS Code webview the extension injects window.__SIGNAL_DASH_API__.
const BASE = typeof window !== 'undefined' && window.__SIGNAL_DASH_API__ || ''

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
