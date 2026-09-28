import React, { useMemo, useState } from 'react'
import { fmtDay, fmtDayYear, fmtTime, fmtWeekday, platformLabel, plural } from '../lib/format.js'
import { EntityText, ToneMark } from './Bits.jsx'

const PAGE = 16

// The record: what was said and when, newest first, grouped by UTC day.
export default function Statements({ model, visible, onPick, demo, sel, snapshot }) {
  const [limit, setLimit] = useState(PAGE)
  const [onlySel, setOnlySel] = useState(true)
  const focus = onlySel ? sel.ticker : null

  const posts = useMemo(() => {
    if (!model) return []
    const keep = []
    for (let i = model.posts.length - 1; i >= 0; i--) {
      const p = model.posts[i]
      const ms = p.mentions.map((m) => `${p.id}:${m.ticker}`)
      if (visible && !ms.some((id) => visible.has(id))) continue
      if (focus && !p.mentions.some((m) => m.ticker === focus)) continue
      keep.push(p)
    }
    return keep
  }, [model, visible, focus])

  const days = useMemo(() => {
    const out = []
    for (const p of posts.slice(0, limit)) {
      const last = out[out.length - 1]
      if (last && last.day === p.day) last.posts.push(p)
      else out.push({ day: p.day, t: p.t, posts: [p] })
    }
    return out
  }, [posts, limit])

  const flagsByDay = useMemo(() => {
    const m = new Map()
    for (const f of model?.flaggedDays || []) {
      if (f.kind !== 'coordinated') continue
      if (!m.has(f.date)) m.set(f.date, [])
      m.get(f.date).push(f)
    }
    return m
  }, [model])

  return (
    <section className="section statements" id="statements" aria-labelledby="statements-h">
      <div className="container">
        <div className="section-head">
          <p className="kicker">03 — Statements</p>
          <h2 id="statements-h">What was said, and when.</h2>
          <p className="section-sub">
            Flagged posts, newest first. Highlighted words are what the detector matched to a ticker. Times are UTC.
          </p>
          <span className="section-count" aria-hidden="true">
            ({String(posts.length).padStart(2, '0')})
          </span>
        </div>

        {demo && (
          <p className="demo-note">
            <strong>Demo data.</strong> These posts are synthetic samples generated for the demo, not real statements by any
            official. Prices are real daily closes.
            {snapshot && ` You’re viewing the bundled offline snapshot from ${fmtDayYear(snapshot.generated_at.slice(0, 10))}.`}
          </p>
        )}

        {sel.ticker && (
          <p className="st-scope">
            {onlySel ? (
              <>
                Showing posts that name <span className="mono">{sel.ticker}</span>.{' '}
                <button type="button" className="link" onClick={() => setOnlySel(false)}>
                  Show all companies
                </button>
              </>
            ) : (
              <button type="button" className="link" onClick={() => setOnlySel(true)}>
                Only posts naming {sel.ticker}
              </button>
            )}
          </p>
        )}

        {!model && <p className="empty">Statements appear once the data service responds.</p>}
        {model && posts.length === 0 && (
          <p className="empty">No flagged posts match these filters. Widen the period or reset a filter.</p>
        )}

        <div className="st-days">
          {days.map((d) => (
            <div className="st-day" key={d.day}>
              <div className="st-date">
                <span className="st-date-d">{fmtDay(d.day)}</span>
                <span className="st-date-w">{fmtWeekday(d.t)}</span>
                {(flagsByDay.get(d.day) || []).map((f) => (
                  <span className="st-flag" key={f.ticker}>
                    <span className="mono">{f.ticker}</span> named by {f.officials.length}{' '}
                    {plural(f.officials.length, 'official')}
                  </span>
                ))}
              </div>
              <ol className="st-list">
                {d.posts.map((p) => (
                  <li key={p.id} className="st">
                    <p className="st-meta">
                      <span className="mono">{fmtTime(p.t)}</span>
                      <span className="st-who">{p.official}</span>
                      <span className="muted">{platformLabel(p.platform)}</span>
                    </p>
                    <p className="st-text">
                      <EntityText text={p.text} mentions={p.mentions} />
                    </p>
                    <div className="st-foot">
                      <ToneMark score={p.sentiment} />
                      <span className="st-tickers">
                        {p.mentions.map((m) => (
                          <button
                            key={m.ticker}
                            type="button"
                            className="chip-t on-paper"
                            onClick={() => onPick(m.ticker, `${p.id}:${m.ticker}`)}
                          >
                            {m.ticker}
                            <span aria-hidden="true"> ↗</span>
                            <span className="sr-only">: open this mention on the price chart</span>
                          </button>
                        ))}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        {posts.length > limit && (
          <button type="button" className="btn-secondary more" onClick={() => setLimit((l) => l + PAGE * 2)}>
            Show more <span className="muted">({posts.length - limit} left)</span>
          </button>
        )}
      </div>
    </section>
  )
}
