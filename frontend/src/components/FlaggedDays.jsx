import React, { useMemo } from 'react'
import { fmtDayYear, plural } from '../lib/format.js'
import { DAY } from '../lib/data.js'

// Days the backend's anomaly rules flagged (analysis/signals.py).
export default function FlaggedDays({ model, filters, onPick }) {
  const rows = useMemo(() => {
    if (!model) return []
    const by = new Map()
    for (const f of model.flaggedDays) {
      if (filters.since != null && f.t + DAY < filters.since) continue
      if (filters.until != null && f.t > filters.until) continue
      if (filters.official && !f.officials.includes(filters.official)) continue
      const k = `${f.date}|${f.ticker}`
      const r = by.get(k) || { date: f.date, t: f.t, ticker: f.ticker, kinds: {}, officials: f.officials, count: f.mention_count }
      r.kinds[f.kind] = f.confidence
      by.set(k, r)
    }
    return [...by.values()].sort((a, b) => b.t - a.t || a.ticker.localeCompare(b.ticker))
  }, [model, filters])

  const postFor = (r) => {
    const m = model.mentions.find((x) => x.ticker === r.ticker && x.day === r.date)
    return m ? m.id : null
  }

  return (
    <section className="section flagged" id="flagged" aria-labelledby="flagged-h">
      <div className="container">
        <div className="section-head">
          <p className="kicker">04 — Flagged days</p>
          <h2 id="flagged-h">When mentions bunch up.</h2>
          <span className="section-count" aria-hidden="true">
            ({String(rows.length).padStart(2, '0')})
          </span>
        </div>
        <div className="fl-grid">
          <dl className="fl-defs">
            <div>
              <dt>Coordinated</dt>
              <dd>Two or more officials named the same ticker on the same UTC day.</dd>
            </div>
            <div>
              <dt>Spike</dt>
              <dd>
                The day’s mentions of a ticker ran at least two standard deviations above its trailing 30-day average, with two or
                more mentions.
              </dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>The detector’s rule-of-thumb weighting from 0 to 1. It is not a probability.</dd>
            </div>
          </dl>
          <div className="fl-list">
            {!model && <p className="empty">Flagged days appear once the data service responds.</p>}
            {model && rows.length === 0 && <p className="empty">No flagged days in this range.</p>}
            {rows.map((r) => (
              <button type="button" key={`${r.date}${r.ticker}`} className="fl-row" onClick={() => onPick(r.ticker, postFor(r))}>
                <span className="fl-date mono">{fmtDayYear(r.date)}</span>
                <span className="fl-t">{r.ticker}</span>
                <span className="fl-kinds">
                  {r.kinds.coordinated != null && <span className="flag-kind is-coordinated">Coordinated</span>}
                  {r.kinds.spike != null && <span className="flag-kind is-spike">Spike</span>}
                </span>
                <span className="fl-who">
                  {r.officials.join(', ')}
                  <span className="muted">
                    {' '}
                    · {r.officials.length} {plural(r.officials.length, 'official')}
                  </span>
                </span>
                <span className="fl-score mono" title="Rule-of-thumb score, not a probability">
                  {Math.max(...Object.values(r.kinds)).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
