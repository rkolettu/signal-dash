import React from 'react'
import { fmtDate, fmtScore, fmtTime, platformLabel, plural, TONE_LABEL } from '../lib/format.js'

export default function Tooltip({ hover, model, agg, hero, mode }) {
  if (!hover || !model || !hero) return null
  let body = null
  if (hover.kind === 'node') {
    const c = model.companies.get(hover.ticker)
    const a = agg.get(hover.ticker)
    if (!c) return null
    body = (
      <>
        <p className="tt-k">
          <span className="mono">{hover.ticker}</span> {c.name}
        </p>
        <p className="tt-row">
          {a ? (
            <>
              {a.count} {plural(a.count, 'mention')} · {a.officials.size} {plural(a.officials.size, 'official')} · avg tone{' '}
              {fmtScore(a.avg)}
            </>
          ) : (
            'No mentions match the filters'
          )}
        </p>
        {a && <p className="tt-row muted">Latest {fmtDate(a.last)}</p>}
      </>
    )
  } else {
    const m = model.mentions.find((x) => x.id === hover.key)
    if (!m) return null
    body = (
      <>
        <p className="tt-k">
          <span className="mono">{m.ticker}</span> {fmtDate(m.t)} · {fmtTime(m.t)}
        </p>
        <p className="tt-row">
          {m.official} · {platformLabel(m.platform)} · {TONE_LABEL[m.tone]} {fmtScore(m.sentiment)}
        </p>
        <p className="tt-quote">“{m.post.text.length > 110 ? `${m.post.text.slice(0, 108)}…` : m.post.text}”</p>
      </>
    )
  }
  const right = hover.x > hero.w * 0.62
  const off = hover.kind === 'node' ? (hover.r || 0) + 18 : 16
  const style = {
    left: right ? undefined : hover.x + off,
    right: right ? hero.w - hover.x + off : undefined,
    top: hover.y,
  }
  return (
    <div className={`tooltip mode-${mode}`} style={style} role="tooltip">
      {body}
    </div>
  )
}
