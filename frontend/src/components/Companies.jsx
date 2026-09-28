import React, { useMemo } from 'react'
import { fmtDate, fmtScore, plural, TONE_GLYPH } from '../lib/format.js'
import { Count } from './Bits.jsx'

// One row per company, ranked by mentions in view. The dots are the
// mentions themselves (one glyph each, shaped by tone), not a scaled bar.
export default function Companies({ model, agg, sel, onPick, filtered }) {
  const rows = useMemo(() => {
    if (!model) return []
    return model.companyOrder
      .map((t) => ({ c: model.companies.get(t), a: agg.get(t) }))
      .filter((r) => r.a && r.a.count)
      .sort((x, y) => y.a.count - x.a.count || x.c.ticker.localeCompare(y.c.ticker))
  }, [model, agg])
  const max = Math.max(1, ...rows.map((r) => r.a.count))

  return (
    <section className="section companies" id="companies" aria-labelledby="companies-h">
      <div className="container">
        <div className="section-head">
          <p className="kicker">02 — Companies</p>
          <h2 id="companies-h">Where the mentions cluster.</h2>
          <p className="section-sub">
            Ranked by mentions{filtered ? ' matching your filters' : ''}. Each mark is one mention; its shape is the post’s tone.
          </p>
          <span className="section-count" aria-hidden="true">
            ({String(rows.length).padStart(2, '0')})
          </span>
        </div>
        {!model && <p className="empty">Company list appears once the data service responds.</p>}
        {model && rows.length === 0 && (
          <p className="empty">No companies match these filters. Widen the period or reset a filter.</p>
        )}
        <ol className="co-list">
          {rows.map(({ c, a }, i) => {
            const marks = [...a.mentions].sort((x, y) => x.t - y.t)
            return (
              <li key={c.ticker}>
                <button
                  type="button"
                  className={`co-row${sel.ticker === c.ticker ? ' is-current' : ''}`}
                  onClick={() => onPick(c.ticker)}
                  style={{ '--share': a.count / max }}
                >
                  <span className="co-rank">{String(i + 1).padStart(2, '0')}</span>
                  <span className="co-title">
                    <span className="co-t">{c.ticker}</span>
                    <span className="co-name">{c.name}</span>
                  </span>
                  <span className="co-marks" aria-hidden="true">
                    {marks.map((m) => (
                      <i key={m.id} className={`t-${m.tone}`}>
                        {TONE_GLYPH[m.tone]}
                      </i>
                    ))}
                  </span>
                  <span className="co-stat">
                    <span className="co-n">
                      <Count value={a.count} />
                    </span>
                    <span className="co-sub">{plural(a.count, 'mention')}</span>
                  </span>
                  <span className="co-stat is-tone">
                    <span className="co-n">{fmtScore(a.avg)}</span>
                    <span className="co-sub">avg tone</span>
                  </span>
                  <span className="co-stat is-meta">
                    <span className="co-n">{a.officials.size}</span>
                    <span className="co-sub">{plural(a.officials.size, 'official')}</span>
                  </span>
                  <span className="co-stat is-meta">
                    <span className="co-n mono">{fmtDate(a.last)}</span>
                    <span className="co-sub">latest</span>
                  </span>
                  <span className="co-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
