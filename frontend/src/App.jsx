import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { getFeed, getStocks, getSignals, getChart, FEED_LIMIT, exportUrl, loadSnapshot, toCSV } from './api.js'
import { buildModel, aggregate, matches, isFiltered, EMPTY_FILTERS } from './lib/data.js'
import { prefersReducedMotion, safeSession, useMedia, useReducedMotion } from './lib/motion.js'
import Header from './components/Header.jsx'
import FilterRail from './components/FilterRail.jsx'
import Stage from './components/Stage.jsx'
import Companies from './components/Companies.jsx'
import Statements from './components/Statements.jsx'
import FlaggedDays from './components/FlaggedDays.jsx'
import Method from './components/Method.jsx'
import Footer from './components/Footer.jsx'
import CommandMenu from './components/CommandMenu.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// The deployed demo runs on synthetic posts. Set VITE_DEMO_DATA=false at
// build time once the backend is ingesting real posts.
export const DEMO = import.meta.env.VITE_DEMO_DATA !== 'false'

// VITE_DATA_SOURCE=snapshot builds a static site that never calls the API.
const STATIC = import.meta.env.VITE_DATA_SOURCE === 'snapshot'
// How long to wait on a sleeping API before showing the bundled snapshot.
const SNAPSHOT_AFTER = 12

function useData() {
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState({ phase: 'connecting', elapsed: 0, readyIn: null, source: null, reason: null })
  const [raw, setRaw] = useState(null)
  const [pendingLive, setPendingLive] = useState(null)
  useEffect(() => {
    let alive = true
    let settled = false
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const started = performance.now()
    setLoad((l) => ({ phase: 'connecting', elapsed: 0, readyIn: null, source: l.source, reason: null }))
    setPendingLive(null)
    const timer = setInterval(() => {
      const s = Math.floor((performance.now() - started) / 500) / 2
      if (s >= SNAPSHOT_AFTER) fallBack('slow')
      setLoad((l) =>
        l.phase === 'ready' || l.phase === 'error' || l.elapsed === s
          ? l
          : { ...l, elapsed: s, phase: s >= 2.5 ? 'waking' : 'connecting' },
      )
    }, 250)
    const ready = (data, source, reason = null, extra = {}) => {
      settled = true
      clearInterval(timer)
      setRaw(data)
      setLoad((l) => ({ ...l, phase: 'ready', readyIn: performance.now() - started, source, reason, ...extra }))
    }
    function fallBack(reason) {
      if (!alive || settled) return
      settled = true
      loadSnapshot()
        .then((snap) => {
          if (!alive) return
          ready({ feed: snap.feed, stocks: snap.stocks, signals: snap.signals, snapshot: snap }, 'snapshot', reason, {
            snapshotAt: snap.generated_at,
          })
        })
        .catch(() => alive && setLoad((l) => ({ ...l, phase: 'error', elapsed: (performance.now() - started) / 1000 })))
    }
    if (STATIC) {
      fallBack('static')
    } else {
      const o = ctrl ? { signal: ctrl.signal } : undefined
      Promise.all([getFeed({ limit: FEED_LIMIT }, o), getStocks(o), getSignals(o).catch(() => [])])
        .then(([feed, stocks, signals]) => {
          if (!alive) return
          // Arrived after the snapshot was already on screen: offer it
          // instead of swapping the data under the reader.
          if (settled) setPendingLive({ feed, stocks, signals })
          else ready({ feed, stocks, signals }, 'live')
        })
        .catch((err) => fallBack(err?.reason || 'unreachable'))
    }
    return () => {
      alive = false
      ctrl?.abort()
      clearInterval(timer)
    }
  }, [attempt])
  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  const switchToLive = useCallback(() => {
    if (!pendingLive) return
    setRaw(pendingLive)
    setPendingLive(null)
    setLoad((l) => ({ ...l, source: 'live', reason: null }))
  }, [pendingLive])
  return { load, raw, retry, pendingLive: Boolean(pendingLive), switchToLive }
}

// Daily closes per ticker. In snapshot mode they come from the bundled file;
// if a live chart request fails, the bundled closes for that ticker (real
// Yahoo Finance data, through the snapshot date) are used and labelled.
function usePrices(snapshot) {
  const [state, setState] = useState(() => new Map())
  const asked = useRef(new Map())
  useEffect(() => {
    asked.current = new Map()
    setState(new Map())
  }, [snapshot])
  const request = useCallback(
    (ticker, days) => {
      const prev = asked.current.get(ticker)
      if (prev && prev >= days) return
      asked.current.set(ticker, days)
      const fromSnapshot = (snap) => {
        const c = snap?.charts?.[ticker]
        return c ? { status: 'ready', prices: c.prices || [], source: 'snapshot', through: snap.generated_at } : null
      }
      if (snapshot) {
        setState((s) => new Map(s).set(ticker, fromSnapshot(snapshot) || { status: 'ready', prices: [], source: 'snapshot' }))
        return
      }
      setState((s) => (s.get(ticker)?.status === 'ready' ? s : new Map(s).set(ticker, { status: 'loading' })))
      getChart(ticker, days)
        .then((d) => setState((s) => new Map(s).set(ticker, { status: 'ready', prices: d.prices || [], source: 'live' })))
        .catch(() =>
          loadSnapshot()
            .then((snap) => fromSnapshot(snap))
            .catch(() => null)
            .then((fallback) => {
              if (!fallback || fallback.prices.length < 2) asked.current.delete(ticker)
              setState((s) => new Map(s).set(ticker, fallback && fallback.prices.length ? fallback : { status: 'error' }))
            }),
        )
    },
    [snapshot],
  )
  return useMemo(() => ({ state, request }), [state, request])
}

const readHash = () => {
  const m = /^#\/([A-Za-z0-9.-]+)(?:\/(\d+))?$/.exec(window.location.hash || '')
  return m ? { ticker: m[1].toUpperCase(), id: m[2] ? `${m[2]}:${m[1].toUpperCase()}` : null } : { ticker: null, id: null }
}
const writeHash = (ticker, id) => {
  const h = ticker ? `#/${ticker}${id ? `/${id.split(':')[0]}` : ''}` : ''
  try {
    if ((window.location.hash || '') === h) return
    window.history.pushState(null, '', h || window.location.pathname + window.location.search)
  } catch {
    /* history can be unavailable in some embedded webviews */
  }
}

export default function App() {
  const reduced = useReducedMotion()
  const compact = useMedia('(max-width: 760px)')
  const { load, raw, retry, pendingLive, switchToLive } = useData()
  const model = useMemo(() => (raw ? buildModel(raw.feed, raw.stocks, raw.signals) : null), [raw])
  const snapshot = raw?.snapshot || null
  const prices = usePrices(snapshot)

  // Offline, the CSV is the backend's own export rows from the snapshot.
  const csv = useMemo(() => {
    if (!snapshot) return { href: exportUrl, download: undefined }
    try {
      return {
        href: URL.createObjectURL(new Blob([toCSV(snapshot.export || [])], { type: 'text/csv' })),
        download: 'signals.csv',
      }
    } catch {
      return { href: exportUrl, download: undefined }
    }
  }, [snapshot])
  useEffect(() => () => csv.href.startsWith('blob:') && URL.revokeObjectURL(csv.href), [csv])
  const source = { load, pendingLive, switchToLive, retry, snapshot, isStatic: STATIC }

  /* ---- intro: full-bleed loader → docking → dashboard ---- */
  const [intro, setIntro] = useState(() => (prefersReducedMotion() || safeSession('sd-intro') ? 'docked' : 'full'))
  useEffect(() => {
    if (intro !== 'full' || load.phase !== 'ready') return undefined
    // Quick loads dock almost at once; after a long wait, let the noise
    // visibly organise on the full-bleed stage before it docks.
    const t = setTimeout(() => setIntro('docking'), load.readyIn < 900 ? 300 : 1300)
    return () => clearTimeout(t)
  }, [intro, load.phase, load.readyIn])
  useEffect(() => {
    if (intro !== 'docking') return undefined
    const t = setTimeout(
      () => {
        setIntro('docked')
        safeSession('sd-intro', '1')
      },
      reduced ? 0 : 1350,
    )
    return () => clearTimeout(t)
  }, [intro, reduced])
  const skip = useCallback(() => setIntro((i) => (i === 'full' ? 'docking' : i)), [])
  useEffect(() => {
    document.documentElement.classList.toggle('is-locked', intro === 'full')
  }, [intro])

  /* ---- filters and selection ---- */
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sel, setSel] = useState({ ticker: null, id: null })
  const [view, setView] = useState('clusters')
  const [cmd, setCmd] = useState(false)

  const select = useCallback((ticker, id = null) => {
    setSel({ ticker: ticker || null, id: ticker ? id : null })
    writeHash(ticker, ticker ? id : null)
  }, [])
  const selRef = useRef(sel)
  selRef.current = sel
  const back = useCallback(() => {
    const s = selRef.current
    if (s.id) select(s.ticker)
    else select(null)
  }, [select])

  // Deep links (#/PLTR or #/PLTR/59) and the browser back button.
  useEffect(() => {
    if (!model || intro !== 'docked') return undefined
    const apply = () => {
      const h = readHash()
      if (h.ticker && !model.companies.has(h.ticker)) return setSel({ ticker: null, id: null })
      if (h.id && !model.mentions.some((m) => m.id === h.id)) h.id = null
      setSel(h)
    }
    apply()
    window.addEventListener('popstate', apply)
    return () => window.removeEventListener('popstate', apply)
  }, [model, intro])

  const visible = useMemo(() => {
    if (!model || !isFiltered(filters)) return null
    return new Set(model.mentions.filter((m) => matches(m, filters)).map((m) => m.id))
  }, [model, filters])
  const agg = useMemo(
    () => (model ? aggregate(visible ? model.mentions.filter((m) => visible.has(m.id)) : model.mentions) : new Map()),
    [model, visible],
  )
  const flaggedByTicker = useMemo(() => {
    const by = new Map()
    if (!model) return by
    for (const f of model.flaggedDays) {
      if (filters.since != null && f.t + 86400000 < filters.since) continue
      if (filters.until != null && f.t > filters.until) continue
      if (!by.has(f.ticker)) by.set(f.ticker, [])
      by.get(f.ticker).push(f)
    }
    return by
  }, [model, filters])

  const focusCompany = useCallback(
    (ticker, id = null) => {
      select(ticker, id)
      const top = document.getElementById('field')
      if (top) top.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    },
    [select, reduced],
  )

  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/input|textarea|select/i.test(e.target.tagName))) {
        e.preventDefault()
        if (model) setCmd((c) => !c)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [model])

  return (
    <>
      <a className="skip-link" href="#companies">
        Skip to companies
      </a>
      <Header intro={intro} demo={DEMO} csv={csv} source={source}>
        <FilterRail
          show={intro !== 'full'}
          model={model}
          filters={filters}
          setFilters={setFilters}
          onSearch={() => setCmd(true)}
          anchor={snapshot ? Date.parse(snapshot.generated_at) : null}
          sel={sel}
          select={select}
        />
      </Header>
      <main>
        <h1 className="sr-only">Signal Dash: company mentions by U.S. officials and the stock around each one</h1>
        <Stage
          model={model}
          load={load}
          visible={visible}
          agg={agg}
          sel={sel}
          select={select}
          back={back}
          view={view}
          setView={setView}
          reduced={reduced}
          compact={compact}
          intro={intro}
          onSkip={skip}
          onRetry={retry}
          prices={prices}
          filters={filters}
          setFilters={setFilters}
          flaggedByTicker={flaggedByTicker}
        />
        {intro !== 'full' && (
          <ErrorBoundary className="container">
            <div className="paper">
              <Companies model={model} agg={agg} sel={sel} onPick={focusCompany} filtered={isFiltered(filters)} />
              <Statements
                model={model}
                visible={visible}
                filters={filters}
                onPick={focusCompany}
                demo={DEMO}
                sel={sel}
                snapshot={snapshot}
              />
              <FlaggedDays model={model} filters={filters} onPick={focusCompany} />
              <Method csv={csv} />
            </div>
          </ErrorBoundary>
        )}
      </main>
      {intro !== 'full' && <Footer csv={csv} />}
      {cmd && model && (
        <CommandMenu
          model={model}
          agg={agg}
          onClose={() => setCmd(false)}
          onCompany={(t) => focusCompany(t)}
          onMention={(m) => focusCompany(m.ticker, m.id)}
          onOfficial={(o) => setFilters({ ...filters, official: o })}
        />
      )}
      <Analytics />
    </>
  )
}
