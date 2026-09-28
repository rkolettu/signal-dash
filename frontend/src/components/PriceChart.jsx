import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRelRect } from '../lib/hooks.js'
import { easeInOut } from '../lib/motion.js'
import { DAY, closeTime, lineValueAt } from '../lib/data.js'
import { fmtDate, fmtPrice } from '../lib/format.js'
import { niceTicks } from './Timeline.jsx'

const PAD = { l: 2, r: 60, t: 26, b: 30 }
const STACK = 12

function priceDomain(prices, x0, x1, extra = []) {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < prices.length; i++) {
    const t = closeTime(prices[i].date)
    // include one close beyond each edge so the line reaches the frame
    const inRange = t >= x0 && t <= x1
    const edge =
      (i + 1 < prices.length && closeTime(prices[i + 1].date) >= x0 && t < x0) ||
      (i > 0 && closeTime(prices[i - 1].date) <= x1 && t > x1)
    if (inRange || edge) {
      lo = Math.min(lo, prices[i].close)
      hi = Math.max(hi, prices[i].close)
    }
  }
  for (const v of extra) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  if (!Number.isFinite(lo)) return [0, 1]
  const pad = Math.max((hi - lo) * 0.14, hi * 0.004)
  return [lo - pad, hi + pad]
}

// Daily closes for one company, with its mentions placed on the line.
// The mention particles themselves are drawn by the field engine; this
// component tells it where each one belongs.
export default function PriceChart({ ticker, state, mentions, visible, event, change, engine, heroRef, reduced, onPick }) {
  const slotRef = useRef(null)
  const rect = useRelRect(slotRef, heroRef, [])
  const prices = state?.status === 'ready' ? state.prices : null
  // A single close can't draw a line or anchor a before/after comparison.
  const hasPrices = Boolean(prices && prices.length > 1)
  const shown = useMemo(() => mentions.filter((m) => !visible || visible.has(m.id)), [mentions, visible])

  const target = useMemo(() => {
    if (!mentions.length) return null
    const first = mentions[0].t
    const last = mentions[mentions.length - 1].t
    const lastClose = hasPrices ? closeTime(prices[prices.length - 1].date) + 0.4 * DAY : last + 6 * DAY
    let x0
    let x1
    if (event) {
      x0 = event.t - 13 * DAY
      x1 = Math.min(event.t + 37 * DAY, Math.max(lastClose, event.t + 2 * DAY))
      if (x1 - x0 < 24 * DAY) x0 = x1 - 24 * DAY
    } else {
      x0 = first - 10 * DAY
      x1 = Math.max(lastClose, last + DAY)
    }
    const [y0, y1] = hasPrices ? priceDomain(prices, x0, x1) : [0, 1]
    return { x0, x1, y0, y1 }
  }, [mentions, prices, hasPrices, event])

  // Tween the visible window so zooming into an event feels continuous.
  const [dom, setDom] = useState(null)
  const domRef = useRef(null)
  const tweening = useRef(false)
  useEffect(() => {
    if (!target) return undefined
    const from = domRef.current
    const yJump = from && (from.y1 - from.y0 === 1) !== (target.y1 - target.y0 === 1)
    if (!from || reduced || yJump) {
      domRef.current = target
      setDom(target)
      return undefined
    }
    const t0 = performance.now()
    let raf = 0
    tweening.current = true
    const tick = (now) => {
      const k = easeInOut((now - t0) / 950)
      const d = {
        x0: from.x0 + (target.x0 - from.x0) * k,
        x1: from.x1 + (target.x1 - from.x1) * k,
        y0: from.y0 + (target.y0 - from.y0) * k,
        y1: from.y1 + (target.y1 - from.y1) * k,
      }
      domRef.current = d
      setDom(d)
      if (k < 1) raf = requestAnimationFrame(tick)
      else tweening.current = false
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      tweening.current = false
    }
  }, [target, reduced])

  const lay = useMemo(() => {
    if (!rect || !dom) return null
    const plot = {
      x: rect.x + PAD.l,
      y: rect.y + PAD.t,
      w: Math.max(20, rect.w - PAD.l - PAD.r),
      h: Math.max(20, rect.h - PAD.t - PAD.b),
    }
    const xs = (t) => plot.x + ((t - dom.x0) / (dom.x1 - dom.x0)) * plot.w
    const ys = (v) => plot.y + (1 - (v - dom.y0) / (dom.y1 - dom.y0)) * plot.h
    let d = ''
    let area = ''
    if (hasPrices) {
      const pts = prices.map((p) => [xs(closeTime(p.date)) - rect.x, ys(p.close) - rect.y])
      d = `M${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L')}`
      area = `${d}L${pts[pts.length - 1][0].toFixed(1)} ${(plot.y + plot.h - rect.y).toFixed(1)}L${pts[0][0].toFixed(1)} ${(plot.y + plot.h - rect.y).toFixed(1)}Z`
    }
    const targets = new Map()
    const stacks = []
    for (const m of shown) {
      const x = xs(m.t)
      const v = hasPrices ? lineValueAt(prices, m.t) : null
      let y = v != null ? ys(v) : plot.y + plot.h * 0.55
      // same-day mentions stack upward like beads; STACK keeps their hit
      // targets (below) from overlapping
      const k = stacks.filter((s) => Math.abs(s - x) < 5).length
      stacks.push(x)
      y -= k * STACK
      const inside = x >= plot.x - 3 && x <= plot.x + plot.w + 3
      const a = !inside ? 0 : event && event.id !== m.id ? 0.45 : 1
      targets.set(m.id, { x, y, r: event && event.id === m.id ? 4.8 : 3.9, a })
    }
    return { plot, xs, ys, d, area, targets }
  }, [rect, dom, prices, hasPrices, shown, event])

  // Hand positions to the field. First entry is staggered so the cluster
  // unwinds onto the line oldest-first; later updates follow the window.
  const entered = useRef(false)
  const lastPrices = useRef(prices)
  useEffect(() => {
    if (!engine || !lay) return
    const n = Math.max(1, shown.length)
    const order = new Map(shown.map((m, i) => [m.id, i]))
    if (!entered.current) {
      entered.current = true
      lastPrices.current = prices
      engine.setTargets(lay.targets, { dur: 1250, stagger: (p) => 280 + ((order.get(p.id) ?? 0) / n) * 520 })
    } else if (lastPrices.current !== prices) {
      lastPrices.current = prices
      engine.setTargets(lay.targets, { dur: 1000, stagger: (p) => ((order.get(p.id) ?? 0) / n) * 260 })
    } else {
      engine.setTargets(lay.targets, { immediate: tweening.current, dur: 700 })
    }
  }, [engine, lay, shown, prices])

  useEffect(() => engine?.setSelected(event ? event.id : null), [engine, event])
  useEffect(
    () => () => {
      if (!engine) return
      engine.setSelected(null)
      const n = Math.max(1, engine.parts.length)
      engine.setTargets(new Map(), { dur: 1200, stagger: (p) => (p.idx / n) * 300 })
    },
    [engine],
  )

  // Draw the line in once prices are on screen.
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    if (!hasPrices) return undefined
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)))
    return () => cancelAnimationFrame(id)
  }, [hasPrices])

  const ox = rect?.x ?? 0
  const oy = rect?.y ?? 0
  const ticks = lay ? niceTicks(dom.x0, dom.x1, event ? 6 : 7) : []
  const yTicks = lay && hasPrices ? [0.12, 0.5, 0.88].map((k) => dom.y0 + (dom.y1 - dom.y0) * k) : []

  let ev = null
  if (lay && event && hasPrices && change) {
    const ex = lay.xs(event.t) - ox
    const pt = (p) => (p ? { x: lay.xs(closeTime(p.date)) - ox, y: lay.ys(p.close) - oy, date: p.date } : null)
    const a30 = change.after[2].point
    const end = a30 ? lay.xs(closeTime(a30.date)) - ox : lay.xs(Math.min(dom.x1, event.t + 30 * DAY)) - ox
    ev = { ex, end, base: pt(change.base), pre: pt(change.pre), after: change.after.map((a) => ({ ...a, p: pt(a.point) })) }
  }

  return (
    <div className="chart-slot" ref={slotRef}>
      {lay && (
        <svg
          className="chart-svg"
          width={rect.w}
          height={rect.h}
          role="img"
          aria-label={`${ticker} daily closing prices${event ? ' around the selected mention' : ''}`}
        >
          <defs>
            <linearGradient id="area-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgba(244,241,234,0.075)" />
              <stop offset="1" stopColor="rgba(244,241,234,0)" />
            </linearGradient>
            <clipPath id="plot-clip">
              <rect x={lay.plot.x - ox} y={lay.plot.y - oy - 12} width={lay.plot.w} height={lay.plot.h + 24} />
            </clipPath>
          </defs>
          {yTicks.map((v) => (
            <g key={v} className="grid-y">
              <line x1={lay.plot.x - ox} x2={lay.plot.x - ox + lay.plot.w} y1={lay.ys(v) - oy} y2={lay.ys(v) - oy} />
              <text x={lay.plot.x - ox + lay.plot.w + 10} y={lay.ys(v) - oy + 4}>
                {fmtPrice(v)}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} className="grid-x" x={lay.xs(t) - ox} y={lay.plot.y - oy + lay.plot.h + 22} textAnchor="middle">
              {fmtDate(t)}
            </text>
          ))}
          {ev && (
            <g className="ev-window" clipPath="url(#plot-clip)">
              <rect x={ev.ex} y={lay.plot.y - oy} width={Math.max(0, ev.end - ev.ex)} height={lay.plot.h} className="ev-shade" />
              <line x1={ev.ex} x2={ev.ex} y1={lay.plot.y - oy - 8} y2={lay.plot.y - oy + lay.plot.h} className="ev-line" />
              <text x={ev.ex + 8} y={lay.plot.y - oy + 4} className="ev-tag">
                MENTION
              </text>
            </g>
          )}
          <g className="stems" aria-hidden="true">
            {shown.map((m) => {
              const q = lay.targets.get(m.id)
              if (!q || !q.a) return null
              return (
                <line
                  key={m.id}
                  x1={q.x - ox}
                  x2={q.x - ox}
                  y1={q.y - oy + 6}
                  y2={lay.plot.y - oy + lay.plot.h}
                  className={event?.id === m.id ? 'is-current' : ''}
                  style={{ opacity: q.a }}
                />
              )
            })}
          </g>
          {hasPrices && (
            <g clipPath="url(#plot-clip)">
              <path d={lay.area} fill="url(#area-grad)" className={`area${drawn ? ' is-drawn' : ''}`} />
              <path d={lay.d} pathLength="1" className={`line${drawn ? ' is-drawn' : ''}`} />
            </g>
          )}
          {ev && (
            <g className="ev-marks" clipPath="url(#plot-clip)">
              {ev.pre && <Mark p={ev.pre} label="−7D" />}
              {ev.base && <Mark p={ev.base} label="BASE" strong />}
              {ev.after.map((a) => a.p && <Mark key={a.key} p={a.p} label={`+${a.key.toUpperCase()}`} />)}
            </g>
          )}
        </svg>
      )}
      {state?.status === 'loading' && <p className="chart-note">Loading daily closes for {ticker}…</p>}
      {state?.status === 'error' && (
        <p className="chart-note">Couldn’t load prices for {ticker}. Mentions are shown by date only.</p>
      )}
      {state?.status === 'ready' && !hasPrices && (
        <p className="chart-note">
          {prices?.length === 1
            ? `Yahoo Finance returned a single daily close for ${ticker}, not enough to draw its price. Mentions are shown by date only.`
            : `No price data returned for ${ticker}. Yahoo Finance may be rate-limiting, or the symbol has no daily history.`}
        </p>
      )}
      {lay &&
        shown.map((m) => {
          const q = lay.targets.get(m.id)
          if (!q || !q.a) return null
          return (
            <button
              key={m.id}
              type="button"
              className={`mark-hit${event?.id === m.id ? ' is-current' : ''}`}
              style={{ left: q.x - ox, top: q.y - oy, height: STACK, marginTop: -STACK / 2 }}
              aria-label={`Mention on ${fmtDate(m.t)} by ${m.official}`}
              onClick={() => onPick(m)}
              onFocus={() => engine?.setSelected(m.id)}
              onBlur={() => engine?.setSelected(event ? event.id : null)}
            />
          )
        })}
    </div>
  )
}

// Base is labelled above the line, the other closes below it, so marks a
// day apart don't collide.
function Mark({ p, label, strong }) {
  return (
    <g className={`mk${strong ? ' is-strong' : ''}`}>
      <circle cx={p.x} cy={p.y} r={strong ? 4.5 : 3.5} />
      <text x={p.x} y={strong ? p.y - 12 : p.y + 17} textAnchor="middle">
        {label}
      </text>
    </g>
  )
}
