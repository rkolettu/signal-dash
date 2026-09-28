// Display formatting only. Nothing here changes what the data says.

const UTC = 'UTC'
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: UTC })
const dateYearFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: UTC })
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: UTC })
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: UTC })

export const toMs = (iso) => Date.parse(iso)
export const dayKey = (iso) => iso.slice(0, 10) // posts are stored as ISO 8601 UTC

export const fmtDate = (ms) => dateFmt.format(ms)
export const fmtDateYear = (ms) => dateYearFmt.format(ms)
export const fmtTime = (ms) => `${timeFmt.format(ms)} UTC`
export const fmtWeekday = (ms) => weekdayFmt.format(ms)
export const fmtDay = (iso) => dateFmt.format(Date.parse(`${iso}T00:00:00Z`))
export const fmtDayYear = (iso) => dateYearFmt.format(Date.parse(`${iso}T00:00:00Z`))

export function fmtRange(a, b) {
  if (a == null || b == null) return ''
  const ya = new Date(a).getUTCFullYear()
  const yb = new Date(b).getUTCFullYear()
  return ya === yb ? `${fmtDate(a)} – ${fmtDateYear(b)}` : `${fmtDateYear(a)} – ${fmtDateYear(b)}`
}

export const fmtPrice = (v) => (v == null ? '—' : `$${v.toFixed(2)}`)

export function fmtPct(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '—'
  const s = Math.abs(v).toFixed(digits)
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}%`
}

export function fmtScore(v) {
  if (v == null) return '—'
  const s = Math.abs(v).toFixed(2)
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}`
}

export const platformLabel = (p) => (p === 'truth_social' ? 'Truth Social' : p === 'x' ? 'X' : p)

// Tone bands use the same 0.25 cut-off the backend uses to flag positive
// posts (analysis/sentiment.py POSITIVE_THRESHOLD), mirrored for negative.
export const TONE_CUT = 0.25
export function toneOf(score) {
  if (score == null) return 'neu'
  if (score >= TONE_CUT) return 'pos'
  if (score <= -TONE_CUT) return 'neg'
  return 'neu'
}
export const TONE_LABEL = { pos: 'Positive', neu: 'Neutral', neg: 'Negative' }
export const TONE_GLYPH = { pos: '●', neu: '○', neg: '◆' }

// SEC titles arrive in mixed forms ("INTEL CORP", "Tesla, Inc."). Strip the
// legal suffix and fix all-caps casing for display; the raw title is still
// shown wherever the full company record is.
const SUFFIX = /[\s,]+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|n\.?v|s\.?a|ag|lp|llc)\.?$/i
export function companyName(raw) {
  if (!raw) return ''
  let name = raw.trim()
  for (let i = 0; i < 3; i++) name = name.replace(SUFFIX, '').trim()
  name = name.replace(/[,\s]+$/, '')
  if (name === name.toUpperCase()) {
    name = name
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\b(Ii|Iii|Iv)\b/g, (m) => m.toUpperCase())
  }
  return name || raw
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const numberWord = (n) => WORDS[n] ?? String(n)
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many)
