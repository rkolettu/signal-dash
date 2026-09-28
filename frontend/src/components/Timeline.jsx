import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRelRect } from '../lib/hooks.js'
import { fmtDate, fmtDateYear } from '../lib/format.js'
import { DAY } from '../lib/data.js'

const LABEL_W = 118
const AXIS_H = 26
const MIN_LANE = 18
const SPACING = 6.5

export function niceTicks(t0, t1, max = 7) {
  const steps = [1, 2, 3, 7, 14, 28, 56, 91, 182, 365]
  const span = (t1 - t0) / DAY
  const step = steps.find((s) => span / s <= max) || 730
  const out = []
  let d = Math.ceil(t0 / DAY / step) * step
  while (d * DAY <= t1) {
    out.push(d * DAY)
    d += step
  }
  return out
}

export function layoutTimeline(list, order, rect) {
  const counts = new Map()
  for (const m of list) counts.set(m.ticker, (counts.get(m.ticker) || 0) + 1)
  const plot = { x: rect.x + LABEL_W, y: rect.y + 4, w: Math.max(40, rect.w - LABEL_W - 8), h: Math.max(40, rect.h - AXIS_H - 4) }
  const all = order.filter((t) => counts.get(t))
  const fit = Math.max(1, Math.floor(plot.h / MIN_LANE))
  const lanes = all.slice(0, fit)
  const hidden = all.length - lanes.length
  const laneH = plot.h / Math.max(1, lanes.length)
  const laneY = new Map(lanes.map((t, i) => [t, plot.y + (i + 0.5) * laneH]))
  let t0 = Math.min(...list.map((m) => m.t))
  let t1 = Math.max(...list.map((m) => m.t))
  if (!list.length) {
    t0 = Date.now() - 30 * DAY
    t1 = Date.now()
  }
  const pad = Math.max(12 * 3600000, (t1 - t0) * 0.03)
  t0 -= pad
  t1 += pad
  const x = (t) => plot.x + ((t - t0) / (t1 - t0)) * plot.w
  const targets = new Map()
  const placed = new Map()
  const amp = Math.min(6, laneH / 5)
  for (const m of [...list].sort((a, b) => a.t - b.t)) {
    const y0 = laneY.get(m.ticker)
    if (y0 == null) continue
    const px = x(m.t)
    const mine = placed.get(m.ticker) || []
    let k = 0
    for (const off of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      if (!mine.some((q) => q.k === off && Math.abs(q.x - px) < SPACING)) {
        k = off
        break
      }
    }
    mine.push({ x: px, k })
    placed.set(m.ticker, mine)
    targets.set(m.id, { x: px, y: y0 + k * amp, r: 3.1 })
  }
  return { plot, lanes, laneY, laneH, hidden, t0, t1, x, targets, counts }
}

export default function Timeline({ model, visible, engine, heroRef, filters, setFilters }) {
  const slotRef = useRef(null)
  const rect = useRelRect(slotRef, heroRef, [])
  const list = useMemo(() => model.mentions.filter((m) => !visible || visible.has(m.id)), [model, visible])
  const lay = useMemo(() => (rect ? layoutTimeline(list, model.companyOrder, rect) : null), [list, rect, model])

  useEffect(() => {
    if (!engine || !lay) return
    const n = Math.max(1, engine.parts.length)
    engine.setTargets(lay.targets, { dur: 1250, stagger: (p) => (p.idx / n) * 650 })
  }, [engine, lay])

  useEffect(
    () => () => {
      if (!engine) return
      const n = Math.max(1, engine.parts.length)
      engine.setTargets(new Map(), { dur: 1300, stagger: (p) => (p.idx / n) * 500 })
    },
    [engine],
  )

  // Drag to choose a date range; hover to read the date under the pointer.
  const [drag, setDrag] = useState(null)
  const [scrub, setScrub] = useState(null)
  const local = (e) => {
    const r = slotRef.current.getBoundingClientRect()
    return e.clientX - r.left
  }
  const tAt = (lx) => {
    const { plot, t0, t1 } = lay
    const k = (lx + rect.x - plot.x) / plot.w
    return t0 + Math.min(1, Math.max(0, k)) * (t1 - t0)
  }
  const onDown = (e) => {
    if (!lay || e.button > 0) return
    const lx = local(e)
    if (lx < LABEL_W) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ a: lx, b: lx })
  }
  const onMove = (e) => {
    if (!lay) return
    const lx = local(e)
    setScrub(lx >= LABEL_W ? lx : null)
    if (drag) setDrag({ ...drag, b: lx })
  }
  const onUp = () => {
    if (!drag) return
    const a = Math.min(drag.a, drag.b)
    const b = Math.max(drag.a, drag.b)
    setDrag(null)
    if (b - a < 10) return
    setFilters({ ...filters, period: 'custom', since: Math.floor(tAt(a)), until: Math.ceil(tAt(b)) })
  }

  const ox = rect ? rect.x : 0
  const oy = rect ? rect.y : 0
  const flagged = useMemo(() => {
    if (!lay) return []
    return model.flaggedDays.filter((f) => f.kind === 'coordinated' && lay.laneY.has(f.ticker))
  }, [lay, model])

  return (
    <div
      className="timeline-slot"
      ref={slotRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setScrub(null)}
    >
      {lay && (
        <>
          <svg className="tl-svg" width={rect.w} height={rect.h} aria-hidden="true">
            {lay.lanes.map((t) => (
              <line
                key={t}
                x1={lay.plot.x - ox}
                x2={lay.plot.x - ox + lay.plot.w}
                y1={lay.laneY.get(t) - oy}
                y2={lay.laneY.get(t) - oy}
                className="tl-lane"
              />
            ))}
            {niceTicks(lay.t0, lay.t1).map((t) => (
              <line
                key={t}
                x1={lay.x(t) - ox}
                x2={lay.x(t) - ox}
                y1={lay.plot.y - oy}
                y2={lay.plot.y - oy + lay.plot.h}
                className="tl-tick"
              />
            ))}
            {flagged.map((f) => {
              const cx = lay.x(f.t + DAY / 2) - ox
              const cy = lay.laneY.get(f.ticker) - oy
              if (cx < lay.plot.x - ox || cx > lay.plot.x - ox + lay.plot.w) return null
              return (
                <rect
                  key={`${f.ticker}${f.date}`}
                  x={cx - 9}
                  y={cy - lay.laneH * 0.42}
                  width={18}
                  height={lay.laneH * 0.84}
                  rx={5}
                  className="tl-flag"
                />
              )
            })}
            {drag && Math.abs(drag.b - drag.a) > 2 && (
              <rect
                x={Math.min(drag.a, drag.b)}
                y={lay.plot.y - oy}
                width={Math.abs(drag.b - drag.a)}
                height={lay.plot.h}
                className="tl-brush"
              />
            )}
            {scrub != null && !drag && (
              <line x1={scrub} x2={scrub} y1={lay.plot.y - oy} y2={lay.plot.y - oy + lay.plot.h} className="tl-scrub" />
            )}
          </svg>
          <ul className="tl-lanes" aria-label="Companies">
            {lay.lanes.map((t) => (
              <li key={t} style={{ top: lay.laneY.get(t) - oy }}>
                <span className="tl-t">{t}</span>
                <span className="tl-n">{lay.counts.get(t)}</span>
              </li>
            ))}
          </ul>
          <div className="tl-axis" aria-hidden="true">
            {niceTicks(lay.t0, lay.t1).map((t) => (
              <span
                key={t}
                style={{ left: lay.x(t) - ox, opacity: scrub != null && Math.abs(lay.x(t) - ox - scrub) < 70 ? 0 : 1 }}
              >
                {fmtDate(t)}
              </span>
            ))}
            {scrub != null && (
              <span className="tl-scrub-label" style={{ left: scrub }}>
                {fmtDateYear(tAt(scrub))}
              </span>
            )}
          </div>
          {lay.hidden > 0 && <p className="tl-more">+{lay.hidden} more companies in the lists below</p>}
        </>
      )}
    </div>
  )
}
