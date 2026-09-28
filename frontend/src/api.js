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

// Why the API isn't usable:
//   'not-api'     — something answered, but not the API (a static host's
//                   HTML page, a 4xx)
//   'unreachable' — requests fail immediately (nothing listening)
//   'timeout'     — nothing came back before the deadline
export class ApiUnavailable extends Error {
  constructor(reason, detail = '') {
    super(`API unavailable (${reason}) ${detail}`.trim())
    this.reason = reason
  }
}

// The hosted backend sleeps when idle; while it wakes, requests hang for up
// to a minute and the host may briefly answer 502/503. Slow failures are
// retried until `deadline`; repeated instant failures mean nothing is there.
async function fetchJSON(path, { deadline = 150000, attemptTimeout = 80000, signal } = {}) {
  const started = Date.now()
  let wait = 1200
  let fastFails = 0
  for (;;) {
    if (signal?.aborted) throw new ApiUnavailable('cancelled')
    const t0 = Date.now()
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = ctrl && setTimeout(() => ctrl.abort(), attemptTimeout)
    const stop = () => ctrl?.abort()
    signal?.addEventListener('abort', stop)
    try {
      const r = await fetch(`${BASE}${path}`, ctrl ? { signal: ctrl.signal } : undefined)
      if (r.ok) {
        const type = r.headers.get('content-type') || ''
        if (!type.includes('json')) throw new ApiUnavailable('not-api', `${path} returned ${type || 'no content type'}`)
        try {
          return await r.json()
        } catch {
          throw new ApiUnavailable('not-api', `${path} returned invalid JSON`)
        }
      }
      if (r.status < 500) throw new ApiUnavailable('not-api', `${path} returned HTTP ${r.status}`)
    } catch (err) {
      if (err instanceof ApiUnavailable) throw err
    } finally {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
    }
    if (Date.now() - t0 < 2500) {
      if (++fastFails >= 3) throw new ApiUnavailable('unreachable', path)
    } else {
      fastFails = 0
    }
    if (Date.now() - started + wait > deadline) throw new ApiUnavailable('timeout', path)
    await new Promise((res) => setTimeout(res, wait))
    wait = Math.min(wait * 1.6, 8000)
  }
}

export const getFeed      = (f = {}, o)    => fetchJSON(`/api/feed${q(f)}`, o)
export const getStocks    = (o)            => fetchJSON('/api/stocks', o)
export const getChart     = (t, days = 90) => fetchJSON(`/api/stocks/${encodeURIComponent(t)}/chart?days=${days}`, { deadline: 60000 })
export const getSignals   = (o)            => fetchJSON('/api/signals', o)
export const getOfficials = ()             => fetchJSON('/api/officials')
export const exportUrl    = `${BASE}/api/export?fmt=csv`

// The feed endpoint caps a single response at 500 rows.
export const FEED_LIMIT = 500

// Bundled copy of the demo dataset (see backend/export_snapshot.py), loaded
// only when the API can't be reached. Code-split so it costs nothing otherwise.
export const loadSnapshot = () => import('./data/demo-snapshot.json').then((m) => m.default || m)

// Same columns and order as the backend's /api/export CSV.
export function toCSV(rows) {
  if (!rows.length) return ''
  // Every column any row has, in first-seen order: a row without prices
  // must not drop the price columns for the rest.
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}
