import React, { useMemo } from 'react'
import { entitySpans } from '../lib/data.js'
import { TONE_LABEL, fmtScore, fmtPct, toneOf } from '../lib/format.js'
import { useCountUp } from '../lib/motion.js'

export function ToneMark({ score, withScore = true, className = '' }) {
  const tone = toneOf(score)
  return (
    <span className={`tone tone-${tone} ${className}`}>
      <i className={`lg ${tone}`} aria-hidden="true" />
      <span className="tone-label">{TONE_LABEL[tone]}</span>
      {withScore && <span className="tone-score mono">{fmtScore(score)}</span>}
    </span>
  )
}

// Post text with the words that matched each company marked.
export function EntityText({ text, mentions, focus, onTicker }) {
  const parts = useMemo(() => {
    const spans = entitySpans(text, mentions)
    const out = []
    let i = 0
    for (const s of spans) {
      if (s.start > i) out.push({ text: text.slice(i, s.start) })
      out.push({ text: text.slice(s.start, s.end), ticker: s.ticker })
      i = s.end
    }
    if (i < text.length) out.push({ text: text.slice(i) })
    return out
  }, [text, mentions])
  return (
    <>
      {parts.map((p, i) =>
        p.ticker ? (
          <mark
            key={i}
            className={`ent${focus && p.ticker !== focus ? ' is-other' : ''}`}
            title={`Matched to ${p.ticker}`}
            onClick={onTicker ? () => onTicker(p.ticker) : undefined}
          >
            {p.text}
            {(!focus || p.ticker !== focus) && (
              <sup>
                <span className="sr-only"> (</span>
                {p.ticker}
                <span className="sr-only">)</span>
              </sup>
            )}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  )
}

export function Pct({ value, animate = true }) {
  const v = useCountUp(value ?? 0, { duration: 900, decimals: 2 })
  if (value == null) return <span className="pct is-na">—</span>
  const shown = animate ? v : value
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  return (
    <span className={`pct is-${dir}`}>
      <span className="pct-arrow" aria-hidden="true">
        {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'}
      </span>
      {fmtPct(shown)}
    </span>
  )
}

export function Count({ value }) {
  return <>{useCountUp(value)}</>
}
