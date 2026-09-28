import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useRelRect } from '../lib/hooks.js'
import { chartDays, entitySpans, observedChange, priceMap } from '../lib/data.js'
import {
  fmtDate,
  fmtDateYear,
  fmtDay,
  fmtPrice,
  fmtScore,
  fmtTime,
  fmtWeekday,
  platformLabel,
  plural,
  TONE_CUT,
  TONE_GLYPH,
} from '../lib/format.js'
import { Count, EntityText, Pct, ToneMark } from './Bits.jsx'
import PriceChart from './PriceChart.jsx'

export default function CompanyView({
  model,
  sel,
  select,
  back,
  engine,
  heroRef,
  visible,
  agg,
  prices,
  compact,
  reduced,
  flagged,
}) {
  const ticker = sel.ticker
  const company = model.companies.get(ticker) || { name: ticker, company: ticker }
  const all = useMemo(() => model.mentions.filter((m) => m.ticker === ticker), [model, ticker])
  const shown = useMemo(() => all.filter((m) => !visible || visible.has(m.id)), [all, visible])
  const a = agg.get(ticker)
  const event = sel.id ? all.find((m) => m.id === sel.id) || null : null
  const days = chartDays(all.length ? all[0].t : Date.now())
  const state = prices.state.get(ticker)
  const { request } = prices
  useEffect(() => {
    request(ticker, days)
  }, [request, ticker, days])
  const pmap = useMemo(() => (state?.status === 'ready' ? priceMap(state.prices) : null), [state])
  const change = useMemo(() => (event && pmap ? observedChange(pmap, event.day) : null), [event, pmap])
  const latest = latestBar(state)

  // Pull the camera onto this company's cluster, centred where the chart is.
  const chartWrap = useRef(null)
  const chartRect = useRelRect(chartWrap, heroRef, [event ? 'event' : 'company', compact])
  useEffect(() => {
    if (!engine || !chartRect) return
    const v = engine.view
    engine.setFocus(ticker, {
      anchor: [(chartRect.x + chartRect.w / 2 - v.x) / v.w, (chartRect.y + chartRect.h / 2 - v.y) / v.h],
      zoom: compact ? 1.5 : 1.9,
    })
  }, [engine, ticker, chartRect, compact])

  // The company's label travels from its cluster into the heading.
  const slotRef = useRef(null)
  const slotRect = useRelRect(slotRef, heroRef, [event ? 'event' : 'company', compact])
  useLayoutEffect(() => {
    if (!engine || !slotRect || !slotRef.current) return
    engine.setLabelSlot({ x: slotRect.x, y: slotRect.y, fontPx: parseFloat(getComputedStyle(slotRef.current).fontSize) })
  }, [engine, slotRect])
  useEffect(
    () => () => {
      engine?.setFocus(null)
      engine?.setLabelSlot(null)
    },
    [engine],
  )

  // Keyboard: Esc steps back out; arrows move between this company's mentions.
  const idx = event ? shown.findIndex((m) => m.id === event.id) : -1
  const prev = idx > 0 ? shown[idx - 1] : null
  const next = idx >= 0 && idx < shown.length - 1 ? shown[idx + 1] : null
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest && e.target.closest('input, textarea, [role="dialog"]')) return
      if (e.key === 'Escape') back()
      else if (e.key === 'ArrowLeft' && prev) select(ticker, prev.id)
      else if (e.key === 'ArrowRight' && next) select(ticker, next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back, select, ticker, prev, next])

  return (
    <div className={`su su-company is-${event ? 'event' : 'company'}`}>
      <div className="cv-side">
        <nav className="crumbs" aria-label="Breadcrumb">
          <button type="button" onClick={() => select(null)}>
            <span aria-hidden="true">←</span> All companies
          </button>
          {event && (
            <>
              <span className="crumb-sep" aria-hidden="true">
                /
              </span>
              <button type="button" onClick={() => select(ticker)}>
                {ticker}
              </button>
              <span className="crumb-sep" aria-hidden="true">
                /
              </span>
              <span className="crumb-here">{fmtDate(event.t)}</span>
            </>
          )}
        </nav>

        <div className="ticker-slot" ref={slotRef} aria-hidden="true">
          {ticker}
        </div>
        <h2 className="cv-name">
          <span className="sr-only">{ticker} · </span>
          {company.name}
          <span className="cv-raw mono">{company.company}</span>
        </h2>

        {event ? (
          <EventDetail event={event} ticker={ticker} select={select} prev={prev} next={next} idx={idx} total={shown.length} />
        ) : (
          <CompanyDetail a={a} shown={shown} ticker={ticker} flagged={flagged} select={select} compact={compact} />
        )}
      </div>

      <div className="cv-main">
        {event ? <Reaction change={change} state={state} latest={latest} /> : <ChartHead state={state} a={a} />}
        <div className="cv-chart" ref={chartWrap}>
          <PriceChart
            key={ticker}
            ticker={ticker}
            state={state}
            mentions={all}
            visible={visible}
            event={event}
            change={change}
            engine={engine}
            heroRef={heroRef}
            reduced={reduced}
            onPick={(m) => select(ticker, m.id)}
          />
        </div>
        <p className="cv-caption">
          {event
            ? `Observed change in daily closes around the mention. It shows what the price did, not that the post moved it.${
                latest ? ' The latest bar may be an unfinished trading day.' : ''
              }`
            : state?.source === 'snapshot'
              ? `Daily closes from Yahoo Finance, bundled with the offline snapshot. Each point is a mention, placed at the time it was posted.`
              : 'Daily closes from Yahoo Finance; the newest bar may be an unfinished day. Each point is a mention, placed at the time it was posted.'}
        </p>
      </div>
    </div>
  )
}

function ChartHead({ state, a }) {
  const last = state?.status === 'ready' && state.prices.length > 1 ? state.prices[state.prices.length - 1] : null
  return (
    <div className="chart-head">
      <p className="kicker">Daily close</p>
      <p className="chart-head-v">
        {last ? (
          <>
            <span className="mono">{fmtPrice(last.close)}</span>
            <span className="muted">latest bar · {fmtDay(last.date)}</span>
          </>
        ) : (
          <span className="muted">{state?.status === 'loading' || !state ? 'Loading…' : 'No prices'}</span>
        )}
      </p>
      {a && (
        <p className="chart-head-v">
          <span className="mono">{a.count}</span>
          <span className="muted">{plural(a.count, 'mention')} marked</span>
        </p>
      )}
    </div>
  )
}

function CompanyDetail({ a, shown, ticker, flagged, select, compact }) {
  if (!a) {
    return <p className="cv-empty">No mentions of {ticker} match the current filters.</p>
  }
  const recent = [...shown].reverse()
  return (
    <>
      <dl className="stats">
        <div>
          <dt>Mentions</dt>
          <dd>
            <Count value={a.count} />
          </dd>
        </div>
        <div>
          <dt>Officials</dt>
          <dd>
            <Count value={a.officials.size} />
          </dd>
        </div>
        <div>
          <dt>Avg tone</dt>
          <dd>{fmtScore(a.avg)}</dd>
        </div>
        <div>
          <dt>Latest</dt>
          <dd>{fmtDate(a.last)}</dd>
        </div>
      </dl>
      {flagged.length > 0 && (
        <ul className="cv-flags">
          {flagged.slice(0, 3).map((f) => (
            <li key={`${f.date}${f.kind}`}>
              <span className={`flag-kind is-${f.kind}`}>{f.kind === 'coordinated' ? 'Coordinated' : 'Spike'}</span>
              <span className="mono">{fmtDay(f.date)}</span>
              <span className="muted">
                {f.officials.length} {plural(f.officials.length, 'official')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <ol className="cv-list" aria-label={`Mentions of ${ticker}`}>
          {recent.slice(0, 6).map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => select(ticker, m.id)}>
                <span className={`glyph t-${m.tone}`} aria-hidden="true">
                  {TONE_GLYPH[m.tone]}
                </span>
                <span className="mono">{fmtDate(m.t)}</span>
                <span className="cv-list-who">{m.official}</span>
                <span className="cv-list-go" aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          ))}
          {recent.length > 6 && <li className="cv-more">+{recent.length - 6} more on the chart</li>}
        </ol>
      )}
    </>
  )
}

function EventDetail({ event, ticker, select, prev, next, idx, total }) {
  const p = event.post
  const matched = [...new Set(entitySpans(p.text, [{ ticker, company: event.company }]).map((s) => p.text.slice(s.start, s.end)))]
  const others = p.mentions.filter((m) => m.ticker !== ticker)
  const promo = p.sentiment < TONE_CUT
  return (
    <div className="ev" key={event.id}>
      <p className="ev-who">
        <span>{p.official}</span>
        <span className="muted">{platformLabel(p.platform)}</span>
      </p>
      <p className="ev-when mono">
        {fmtWeekday(event.t)} {fmtDateYear(event.t)} · {fmtTime(event.t)}
      </p>
      <blockquote className="ev-quote">
        <EntityText
          text={p.text}
          mentions={p.mentions}
          focus={ticker}
          onTicker={(t) => t !== ticker && select(t, `${p.id}:${t}`)}
        />
      </blockquote>
      <dl className="ev-facts">
        <div>
          <dt>Detected</dt>
          <dd>
            {matched.length ? matched.map((w) => `“${w}”`).join(', ') : ticker} <span aria-hidden="true">→</span>{' '}
            <span className="mono">{ticker}</span>
          </dd>
        </div>
        <div>
          <dt>Tone</dt>
          <dd>
            <ToneMark score={p.sentiment} />
            {promo && <span className="ev-note">Below the {TONE_CUT} cut-off; flagged for promotional wording.</span>}
          </dd>
        </div>
        {others.length > 0 && (
          <div>
            <dt>Also named</dt>
            <dd className="chips">
              {others.map((m) => (
                <button key={m.ticker} type="button" className="chip-t" onClick={() => select(m.ticker, `${p.id}:${m.ticker}`)}>
                  {m.ticker}
                </button>
              ))}
            </dd>
          </div>
        )}
        {p.url && (
          <div>
            <dt>Source</dt>
            <dd>
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                View original ↗
              </a>
            </dd>
          </div>
        )}
      </dl>
      <div className="ev-nav">
        <button type="button" disabled={!prev} onClick={() => prev && select(ticker, prev.id)} aria-label="Previous mention">
          ←
        </button>
        <span className="mono">
          {idx + 1} / {total}
        </span>
        <button type="button" disabled={!next} onClick={() => next && select(ticker, next.id)} aria-label="Next mention">
          →
        </button>
      </div>
    </div>
  )
}

// The newest daily bar is still moving if it is from the day the prices were
// fetched (today live, or the snapshot's date); figures using it say so.
function latestBar(state) {
  if (state?.status !== 'ready' || state.prices.length < 2) return null
  const last = state.prices[state.prices.length - 1].date
  const fetched =
    state.source === 'snapshot' && state.through ? state.through.slice(0, 10) : new Date().toISOString().slice(0, 10)
  return last >= fetched ? last : null
}

function Reaction({ change, state, latest }) {
  const when = (p) => (p ? `${fmtDay(p.date)}${p.date === latest ? ' · latest bar' : ''}` : 'not yet')
  if (!state || state.status === 'loading')
    return (
      <div className="reaction is-empty">
        <p className="muted">Loading daily closes…</p>
      </div>
    )
  if (!change) {
    return (
      <div className="reaction is-empty">
        <p className="muted">No daily close on or within a week before this date, so there is no base price to measure from.</p>
      </div>
    )
  }
  return (
    <div className="reaction">
      <div className="rx">
        <span className="rx-l">7 days before</span>
        <span className="rx-v">
          <Pct value={change.before7} />
        </span>
        <span className="rx-d mono">{change.pre ? `${fmtDay(change.pre.date)} → ${fmtDay(change.base.date)}` : 'no close'}</span>
      </div>
      <div className="rx is-base">
        <span className="rx-l">Base close</span>
        <span className="rx-v mono">{fmtPrice(change.base.close)}</span>
        <span className="rx-d mono">{when(change.base)}</span>
      </div>
      {change.after.map((x) => (
        <div className="rx" key={x.key}>
          <span className="rx-l">{x.label}</span>
          <span className="rx-v">
            <Pct value={x.pct} />
          </span>
          <span
            className="rx-d mono"
            title={
              x.point?.date === latest
                ? 'This bar is from the day prices were fetched and may be an unfinished trading day.'
                : undefined
            }
          >
            {when(x.point)}
          </span>
        </div>
      ))}
    </div>
  )
}
