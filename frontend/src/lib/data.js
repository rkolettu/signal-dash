// Turns the API's responses into the shapes the interface draws from.
// Every number shown in the UI traces back to a field returned by the
// backend; nothing is estimated or filled in here.
import { toMs, dayKey, toneOf, companyName } from './format.js'

export const DAY = 86400000

export function buildModel(feed, stocks, signals) {
  const posts = feed
    .map((p) => ({ ...p, t: toMs(p.posted_at), day: dayKey(p.posted_at), tone: toneOf(p.sentiment) }))
    .sort((a, b) => a.t - b.t)

  const mentions = []
  for (const p of posts) {
    for (const m of p.mentions) {
      mentions.push({
        id: `${p.id}:${m.ticker}`,
        post: p,
        ticker: m.ticker,
        company: m.company,
        t: p.t,
        day: p.day,
        tone: p.tone,
        sentiment: p.sentiment,
        official: p.official,
        platform: p.platform,
      })
    }
  }

  // Company records: server aggregates first (they cover every flagged post),
  // then any ticker that only appears in the feed.
  const companies = new Map()
  for (const s of stocks) {
    companies.set(s.ticker, { ticker: s.ticker, company: s.company, name: companyName(s.company), total: s.mentions })
  }
  for (const m of mentions) {
    if (!companies.has(m.ticker)) {
      companies.set(m.ticker, { ticker: m.ticker, company: m.company, name: companyName(m.company), total: 0 })
    }
  }
  const order = [...companies.values()]
  const counts = countBy(mentions, (m) => m.ticker)
  order.sort((a, b) => (counts.get(b.ticker) || 0) - (counts.get(a.ticker) || 0) || a.ticker.localeCompare(b.ticker))
  order.forEach((c, i) => {
    c.rank = i
  })

  // Tickers named together in the same post.
  const pairs = new Map()
  for (const p of posts) {
    const ts = [...new Set(p.mentions.map((m) => m.ticker))].sort()
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const k = `${ts[i]}|${ts[j]}`
        pairs.set(k, (pairs.get(k) || 0) + 1)
      }
    }
  }
  const coMentions = [...pairs.entries()].map(([k, n]) => {
    const [a, b] = k.split('|')
    return { a, b, n }
  })

  const officials = [...new Set(posts.map((p) => p.official))].sort()
  const platforms = [...new Set(posts.map((p) => p.platform))].sort()

  const flaggedDays = (signals || [])
    .map((s) => ({ ...s, t: toMs(`${s.date}T00:00:00Z`) }))
    .sort((a, b) => b.t - a.t || a.ticker.localeCompare(b.ticker))

  return {
    posts,
    mentions,
    companies,
    companyOrder: order.map((c) => c.ticker),
    coMentions,
    officials,
    platforms,
    flaggedDays,
    first: posts.length ? posts[0].t : null,
    last: posts.length ? posts[posts.length - 1].t : null,
  }
}

function countBy(list, key) {
  const m = new Map()
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + 1)
  return m
}

export const EMPTY_FILTERS = { official: '', platform: '', tone: '', period: '', since: null, until: null }

export function isFiltered(f) {
  return Boolean(f.official || f.platform || f.tone || f.since != null || f.until != null)
}

export function matches(m, f) {
  if (f.official && m.official !== f.official) return false
  if (f.platform && m.platform !== f.platform) return false
  if (f.tone && m.tone !== f.tone) return false
  if (f.since != null && m.t < f.since) return false
  if (f.until != null && m.t > f.until) return false
  return true
}

export function aggregate(mentions) {
  const by = new Map()
  for (const m of mentions) {
    let a = by.get(m.ticker)
    if (!a) {
      a = {
        ticker: m.ticker,
        count: 0,
        posts: new Set(),
        officials: new Set(),
        sentSum: 0,
        first: m.t,
        last: m.t,
        tones: { pos: 0, neu: 0, neg: 0 },
        mentions: [],
      }
      by.set(m.ticker, a)
    }
    a.count++
    a.posts.add(m.post.id)
    a.officials.add(m.official)
    a.sentSum += m.sentiment ?? 0
    a.first = Math.min(a.first, m.t)
    a.last = Math.max(a.last, m.t)
    a.tones[m.tone]++
    a.mentions.push(m)
  }
  for (const a of by.values()) a.avg = a.count ? a.sentSum / a.count : 0
  return by
}

/* ---------- Price data around a mention ----------
 * Mirrors backend/analysis/prices.py around_mention() so the numbers match
 * the CSV export: the base is the close on or before the mention's UTC date
 * (looking back up to 6 days); each +N figure is the first close on or after
 * date+N calendar days (looking ahead up to 6 days). The "before" figure uses
 * the same lookup 7 days earlier. Daily closes only.
 */
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)

function onOrBefore(map, ms) {
  for (let back = 0; back < 7; back++) {
    const k = iso(ms - back * DAY)
    if (map.has(k)) return { date: k, close: map.get(k) }
  }
  return null
}

function onOrAfter(map, ms) {
  for (let fwd = 0; fwd < 7; fwd++) {
    const k = iso(ms + fwd * DAY)
    if (map.has(k)) return { date: k, close: map.get(k) }
  }
  return null
}

export function priceMap(prices) {
  return new Map(prices.map((p) => [p.date, p.close]))
}

export function observedChange(map, dayIso) {
  const d = Date.parse(`${dayIso}T00:00:00Z`)
  const base = onOrBefore(map, d)
  if (!base) return null
  const pct = (a, b) => (a && b ? Math.round((b.close / a.close - 1) * 10000) / 100 : null)
  const pre = onOrBefore(map, d - 7 * DAY)
  const at = (n) => onOrAfter(map, d + n * DAY)
  const a1 = at(1)
  const a7 = at(7)
  const a30 = at(30)
  return {
    base,
    pre,
    before7: pct(pre, base),
    after: [
      { key: '1d', label: '+1 day', point: a1, pct: pct(base, a1) },
      { key: '7d', label: '+7 days', point: a7, pct: pct(base, a7) },
      { key: '30d', label: '+30 days', point: a30, pct: pct(base, a30) },
    ],
  }
}

// How much history to request for a company so its earliest mention has a
// few weeks of context before it (the chart endpoint caps at 730 days).
export function chartDays(firstMs, now = Date.now()) {
  const days = Math.ceil((now - firstMs) / DAY) + 24
  return Math.max(45, Math.min(730, days))
}

// Daily closes are placed at 20:00 UTC on their date, roughly the U.S.
// market close, so a post's time reads as before or after that day's close.
export const CLOSE_OFFSET = 20 * 3600000
export const closeTime = (date) => Date.parse(`${date}T00:00:00Z`) + CLOSE_OFFSET

// Price on the drawn line at time `ms` (linear between adjacent closes).
export function lineValueAt(prices, ms) {
  if (!prices.length) return null
  const first = closeTime(prices[0].date)
  if (ms <= first) return prices[0].close
  for (let i = 1; i < prices.length; i++) {
    const t1 = closeTime(prices[i].date)
    if (ms <= t1) {
      const t0 = closeTime(prices[i - 1].date)
      const k = (ms - t0) / (t1 - t0)
      return prices[i - 1].close + (prices[i].close - prices[i - 1].close) * k
    }
  }
  return prices[prices.length - 1].close
}

/* ---------- Which words in a post matched the company ----------
 * Display-only approximation of backend/analysis/tickers.py extract():
 * cashtags, bare tickers and the company name with legal suffixes removed.
 * If nothing is found the text is shown unhighlighted.
 */
const NAME_SUFFIX = /\b(inc|corp|corporation|company|co|ltd|plc|holdings?|group|technologies|technology)\b\.?/gi
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function entitySpans(text, mentions) {
  const spans = []
  for (const m of mentions) {
    const res = [new RegExp(`\\$${esc(m.ticker)}\\b`, 'gi')]
    // Bare tickers only count at 2–5 capitals, as in the backend.
    // (A bare match inside a cashtag overlaps it and is dropped below.)
    if (/^[A-Z]{2,5}$/.test(m.ticker)) res.push(new RegExp(`\\b${m.ticker}\\b`, 'g'))
    const norm = (m.company || '')
      .replace(/[^\w\s&]/g, ' ')
      .replace(NAME_SUFFIX, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (norm.length >= 4) {
      const words = norm.split(' ').map(esc).join('[^\\w&]+')
      res.push(new RegExp(`\\b${words}\\b`, 'gi'))
    }
    for (const re of res) {
      let r
      while ((r = re.exec(text))) spans.push({ start: r.index, end: r.index + r[0].length, ticker: m.ticker })
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  const out = []
  for (const s of spans) {
    if (out.length && s.start < out[out.length - 1].end) continue
    out.push(s)
  }
  return out
}
