import React, { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceDot, CartesianGrid,
} from 'recharts'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { getFeed, getStocks, getChart, getSignals, getOfficials, exportUrl } from './api.js'

const RANGES = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }

const fmtDate = (iso) => iso?.slice(0, 10) ?? ''
const sentClass = (s) => (s >= 0.25 ? 'pos' : s <= -0.25 ? 'neg' : 'neu')

function SentimentPill({ value }) {
  return <span className={`pill ${sentClass(value)}`}>{value?.toFixed(2)}</span>
}

function Filters({ filters, setFilters, officials, stocks }) {
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  return (
    <div className="filters">
      <select value={filters.official || ''} onChange={set('official')}>
        <option value="">All officials</option>
        {officials.map((o) => <option key={o.official}>{o.official}</option>)}
      </select>
      <select value={filters.ticker || ''} onChange={set('ticker')}>
        <option value="">All stocks</option>
        {stocks.map((s) => <option key={s.ticker}>{s.ticker}</option>)}
      </select>
      <select value={filters.platform || ''} onChange={set('platform')}>
        <option value="">All platforms</option>
        <option value="truth_social">Truth Social</option>
        <option value="x">X</option>
      </select>
      <input type="date" value={filters.since || ''} onChange={set('since')} />
      <input type="date" value={filters.until || ''} onChange={set('until')} />
      <a className="btn" href={exportUrl}>Export CSV</a>
    </div>
  )
}

function Feed({ posts, onPickTicker }) {
  return (
    <div className="feed">
      {posts.map((p) => (
        <article key={p.id} className="post">
          <header>
            <strong>{p.official}</strong>
            <span className="meta">{p.platform === 'truth_social' ? 'Truth Social' : 'X'} · {fmtDate(p.posted_at)}</span>
            <SentimentPill value={p.sentiment} />
          </header>
          <p>{p.text}</p>
          <footer>
            {p.mentions.map((m) => (
              <button key={m.ticker} className="ticker" onClick={() => onPickTicker(m.ticker)}>
                ${m.ticker}
              </button>
            ))}
            <span className="meta">{p.engagement.toLocaleString()} engagements</span>
          </footer>
        </article>
      ))}
      {posts.length === 0 && <p className="empty">No flagged posts match these filters. Widen the date range or clear a filter.</p>}
    </div>
  )
}

function StocksTable({ stocks, onPick, active }) {
  return (
    <table className="stocks">
      <thead>
        <tr><th>Ticker</th><th>Mentions</th><th>Avg sent.</th><th>Officials</th></tr>
      </thead>
      <tbody>
        {stocks.map((s) => (
          <tr key={s.ticker} className={active === s.ticker ? 'active' : ''}
              onClick={() => onPick(s.ticker)}>
            <td className="mono">${s.ticker}</td>
            <td className="mono">{s.mentions}</td>
            <td><SentimentPill value={s.avg_sentiment} /></td>
            <td className="officials-cell">{s.officials.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PriceChart({ ticker }) {
  const [range, setRange] = useState('3M')
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!ticker) return
    setData(null)
    getChart(ticker, RANGES[range]).then(setData)
  }, [ticker, range])

  const merged = useMemo(() => {
    if (!data) return []
    const mentionDays = new Set(data.mentions.map((m) => m.date))
    return data.prices.map((p) => ({ ...p, mention: mentionDays.has(p.date) ? p.close : null }))
  }, [data])

  if (!ticker) return <p className="empty">Select a stock to overlay mentions on its price chart.</p>
  if (!data) return <p className="empty">Loading {ticker}…</p>
  if (data.prices.length === 0) {
    return <p className="empty">No price data returned for ${ticker}. yfinance may be rate-limited — retry shortly.</p>
  }
  return (
    <div className="chart">
      <div className="chart-head">
        <h3 className="mono">${ticker}</h3>
        <div className="ranges">
          {Object.keys(RANGES).map((r) => (
            <button key={r} className={r === range ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={merged} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={52} />
          <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--grid)', fontSize: 12 }} />
          <Line type="monotone" dataKey="close" stroke="var(--line)" dot={false} strokeWidth={1.6} />
          {merged.filter((d) => d.mention !== null).map((d) => (
            <ReferenceDot key={d.date} x={d.date} y={d.mention} r={5}
                          fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="legend"><span className="dot" /> official mention on that trading day</p>
    </div>
  )
}

function Signals({ signals, onPickTicker }) {
  return (
    <div className="signals">
      {signals.map((s) => (
        <div key={s.id} className={`signal ${s.kind}`}>
          <button className="ticker" onClick={() => onPickTicker(s.ticker)}>${s.ticker}</button>
          <span className="kind">{s.kind}</span>
          <span className="mono">{s.date}</span>
          <span className="meta">{s.officials.join(', ')}</span>
          <span className="mono conf">{Math.round(s.confidence * 100)}%</span>
        </div>
      ))}
      {signals.length === 0 && <p className="empty">No anomalies detected yet.</p>}
    </div>
  )
}

export default function App() {
  const [filters, setFilters] = useState({})
  const [posts, setPosts] = useState([])
  const [stocks, setStocks] = useState([])
  const [officials, setOfficials] = useState([])
  const [signals, setSignals] = useState([])
  const [ticker, setTicker] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => { getFeed(filters).then(setPosts).catch(() => {}) }, [filters])
  useEffect(() => {
    Promise.all([
      getStocks().then(setStocks),
      getSignals().then(setSignals),
      getOfficials().then(setOfficials),
    ])
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'))
  }, [])

  const pickTicker = (t) => { setTicker(t); setFilters({ ...filters, ticker: t }) }

  return (
    <div className="shell">
      <SpeedInsights />
      <header className="masthead">
        <h1>SIGNAL<span>/</span>DASH</h1>
        <p>Stock mentions in official posts · Truth Social + X · research use</p>
      </header>

      <div className="notice demo">
        <strong>Demo.</strong> Posts shown are synthetic samples, not real
        statements by any official. The ingestion pipeline is built and pulls
        live Truth Social and X posts once API credentials are configured.
      </div>

      {status === 'loading' && (
        <div
          className="notice waking"
          style={{
            minHeight: 190,
            padding: '1.6rem',
            marginTop: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.45rem',
          }}
        >
          <strong style={{ color: 'var(--text)', fontSize: '1.05rem' }}>Loading market data…</strong>
          <span>
            Signal Dash runs on free hosting, so the backend goes to sleep after
            being idle. The first visit can take up to a minute while it wakes up.
          </span>
          <span className="meta">The dashboard will appear automatically when the data service is ready.</span>
        </div>
      )}

      {status === 'error' && (
        <div
          className="notice failed"
          style={{
            minHeight: 150,
            padding: '1.6rem',
            marginTop: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.45rem',
          }}
        >
          <strong style={{ color: 'var(--text)', fontSize: '1.05rem' }}>The backend didn't respond.</strong>
          <span>It may still be starting up. Reload the page in a moment and the dashboard should come through.</span>
        </div>
      )}

      {status === 'ready' && (
        <>
          <Filters filters={filters} setFilters={setFilters} officials={officials} stocks={stocks} />
          <main className="grid">
            <section className="col">
              <h2>Flagged feed <span className="count mono">{posts.length}</span></h2>
              <Feed posts={posts} onPickTicker={pickTicker} />
            </section>
            <section className="col">
              <h2>Price correlation</h2>
              <PriceChart ticker={ticker} />
              <h2>Mentioned stocks</h2>
              <StocksTable stocks={stocks} onPick={pickTicker} active={ticker} />
              <h2>Trading signals</h2>
              <Signals signals={signals} onPickTicker={pickTicker} />
            </section>
          </main>
        </>
      )}
    </div>
  )
}
