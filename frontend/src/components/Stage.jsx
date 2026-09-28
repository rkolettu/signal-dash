import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SignalField } from '../field/engine.js'
import { useRelRect } from '../lib/hooks.js'
import Intro from './Intro.jsx'
import FieldOverlay from './FieldOverlay.jsx'
import CompanyView from './CompanyView.jsx'
import Tooltip from './Tooltip.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// The hero. One canvas covers it; an ink frame clipped by the engine starts
// full-bleed while the app loads and settles into the framed stage.
export default function Stage(props) {
  const {
    model,
    loaded,
    step,
    load,
    visible,
    agg,
    sel,
    select,
    back,
    view,
    setView,
    reduced,
    compact,
    intro,
    onSkip,
    onRetry,
    prices,
    filters,
    setFilters,
    flaggedByTicker,
  } = props
  const heroRef = useRef(null)
  const slotRef = useRef(null)
  const frameRef = useRef(null)
  const canvasRef = useRef(null)
  const introH1 = useRef(null)
  const headline = useRef(null)
  const [engine, setEngine] = useState(null)
  const [hover, setHover] = useState(null)
  const cb = useRef({})
  cb.current.select = select
  cb.current.setHover = setHover

  useLayoutEffect(() => {
    const e = new SignalField(canvasRef.current, {
      frame: frameRef.current,
      reduced,
      compact,
      onHover: (h) => cb.current.setHover(h),
      onClick: (h) => {
        if (h.kind === 'node') cb.current.select(h.ticker)
        else cb.current.select(h.ticker, h.key)
      },
    })
    setEngine(e)
    return () => e.destroy()
    // The engine lives for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => engine?.setReduced(reduced), [engine, reduced])
  useLayoutEffect(() => {
    if (engine) engine.compact = compact
  }, [engine, compact])

  /* ---- geometry: hero size, docked stage rect, the loader docking ---- */
  const slot = useRelRect(slotRef, heroRef, [])
  const [hero, setHero] = useState(null)
  useLayoutEffect(() => {
    const el = heroRef.current
    const measure = () =>
      setHero((p) => (p && p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight }))
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  const radius = compact ? 18 : 26
  const lastIntro = useRef(null)
  // Web fonts change the overlay text's size once they load; measure again then.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true))
  }, [])
  useLayoutEffect(() => {
    if (!engine || !hero || !slot) return
    engine.resize(hero.w, hero.h)
    const A = slot.w / slot.h
    // Keep clusters (and their labels) clear of the text drawn over the field.
    const box = slotRef.current.getBoundingClientRect()
    const pad = 16
    const measured = [
      ...frameRef.current.querySelectorAll('.su-field .su-intro, .su-field .su-controls, .su-field .su-head, .su-field .su-hint'),
    ]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => [
        (r.left - pad - box.left) / slot.h - A / 2,
        (r.top - pad - box.top) / slot.h - 0.5,
        (r.right + pad - box.left) / slot.h - A / 2,
        (r.bottom + pad - box.top) / slot.h - 0.5,
      ])
    const fallback = compact
      ? [
          [-A / 2, 0.22, A / 2, 0.5],
          [-A / 2, -0.5, A / 2, -0.43],
        ]
      : [
          [-A / 2, 0.18, -A / 2 + A * 0.44, 0.5],
          [-A / 2, -0.5, A / 2, -0.38],
        ]
    const avoid = measured.length >= 2 ? measured : fallback
    engine.setLayout(
      compact
        ? { aspect: A, unitPx: slot.h, center: [0, -0.1], concept: [0.25, -0.36], avoid }
        : { aspect: A, unitPx: slot.h, center: [A * 0.09, 0.0], avoid },
    )
    const docked = { ...slot, r: radius }
    const full = { x: 0, y: 0, w: hero.w, h: hero.h, r: 0 }
    const prev = lastIntro.current
    lastIntro.current = intro
    if (intro === 'full') engine.setView(full, 0)
    else if (intro === 'docking' && prev === 'full') engine.setView(docked, reduced ? 0 : 1300)
    else if (intro === 'docking') return
    else engine.setView(docked, 0)
    // model and fontsReady change the overlay text the layout keeps clear of
  }, [engine, hero, slot, intro, compact, radius, reduced, model, fontsReady])

  // The loader's sentence travels into the stage headline while docking.
  useLayoutEffect(() => {
    if (intro !== 'docking' || reduced) return
    const a = introH1.current
    const b = headline.current
    if (!a || !b || !a.animate) return
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    if (!ra.width || !rb.width) return
    const s = rb.width / ra.width
    a.animate(
      [
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${rb.left - ra.left}px, ${rb.top - ra.top}px) scale(${s})` },
      ],
      { duration: 1300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    )
  }, [intro, reduced])

  // Only draw while the hero is on screen and the tab is visible.
  useEffect(() => {
    if (!engine) return undefined
    let onScreen = true
    const sync = () => engine.setActive(onScreen && !document.hidden)
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([en]) => {
            onScreen = en.isIntersecting
            sync()
          })
        : null
    io?.observe(heroRef.current)
    document.addEventListener('visibilitychange', sync)
    return () => {
      io?.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [engine])

  /* ---- data into the field ---- */
  useEffect(() => {
    if (!engine || !model) return
    engine.setData({
      mentions: model.mentions,
      companies: model.companyOrder.map((t) => ({ ticker: t, total: model.mentions.filter((m) => m.ticker === t).length })),
      links: model.coMentions,
    })
    engine.organize(intro === 'docked' ? { spread: 800, dur: 1300 } : { spread: 1000, dur: 1500 })
    // Organize once per dataset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, model])

  useEffect(() => engine?.setVisible(visible), [engine, visible])

  // The intro's pipeline story (its steps are timed by App) plays on the
  // noise until the data is handed over.
  const waiting = !model && load.phase !== 'error'
  useEffect(() => {
    if (!engine) return
    engine.setConcept(waiting && step > 0 && step < 6 ? step : null)
  }, [engine, waiting, step])

  const mode = sel.ticker ? (sel.id ? 'event' : 'company') : view === 'timeline' && !compact ? 'timeline' : 'field'
  useEffect(() => {
    setHover(null)
  }, [mode])

  return (
    <section
      id="field"
      ref={heroRef}
      className={`hero intro-${intro} mode-${mode}${compact ? ' is-compact' : ''}`}
      aria-label="Signal field"
    >
      <div className="stage-slot" ref={slotRef} aria-hidden="true" />
      <div className="frame" ref={frameRef}>
        <div className="frame-glow" aria-hidden="true" />
        <canvas ref={canvasRef} className="field-canvas" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />

        <div className="node-labels">
          {model &&
            model.companyOrder.map((t) => (
              <NodeLabel
                key={t}
                ticker={t}
                name={model.companies.get(t)?.name}
                count={agg.get(t)?.count || 0}
                engine={engine}
                interactive={mode === 'field' && intro === 'docked'}
                slotted={sel.ticker === t}
                onSelect={() => select(t)}
              />
            ))}
        </div>

        <div className="stage-ui" aria-hidden={intro === 'full' ? 'true' : undefined}>
          {(mode === 'field' || mode === 'timeline') && (
            <FieldOverlay
              ref={headline}
              model={model}
              load={load}
              agg={agg}
              visible={visible}
              view={view}
              setView={setView}
              compact={compact}
              engine={engine}
              heroRef={heroRef}
              mode={mode}
              filters={filters}
              setFilters={setFilters}
              select={select}
              onRetry={onRetry}
            />
          )}
          {(mode === 'company' || mode === 'event') && model && (
            <ErrorBoundary resetKey={`${sel.ticker}|${sel.id}`} onReset={() => select(null)} className="su">
              <CompanyView
                model={model}
                sel={sel}
                select={select}
                back={back}
                engine={engine}
                heroRef={heroRef}
                visible={visible}
                agg={agg}
                prices={prices}
                compact={compact}
                reduced={reduced}
                flagged={flaggedByTicker.get(sel.ticker) || []}
              />
            </ErrorBoundary>
          )}
        </div>

        {intro !== 'docked' && (
          <Intro
            ref={introH1}
            model={model}
            loaded={loaded}
            load={load}
            step={step}
            intro={intro}
            onSkip={onSkip}
            onRetry={onRetry}
            reduced={reduced}
          />
        )}

        <Tooltip hover={hover} model={model} agg={agg} hero={hero} mode={mode} />
      </div>
    </section>
  )
}

function NodeLabel({ ticker, name, count, engine, interactive, slotted, onSelect }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    if (!engine) return undefined
    engine.registerLabel(ticker, ref.current)
    return () => engine.registerLabel(ticker, null)
  }, [engine, ticker])
  return (
    <button
      ref={ref}
      type="button"
      className={`node-label${slotted ? ' is-slotted' : ''}`}
      tabIndex={interactive ? 0 : -1}
      aria-hidden={interactive ? undefined : 'true'}
      aria-label={`${ticker}, ${name}: ${count} ${count === 1 ? 'mention' : 'mentions'}`}
      onClick={onSelect}
      onPointerEnter={() => engine?.setHighlight(ticker)}
      onPointerLeave={() => engine?.setHighlight(null)}
      onFocus={() => engine?.setHighlight(ticker)}
      onBlur={() => engine?.setHighlight(null)}
    >
      <span className="nl-t">{ticker}</span>
      <span className="nl-n">{count}</span>
    </button>
  )
}
