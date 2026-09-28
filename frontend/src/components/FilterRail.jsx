import React, { useMemo } from 'react'
import { DAY, EMPTY_FILTERS, isFiltered, matches } from '../lib/data.js'
import { fmtDate, platformLabel } from '../lib/format.js'

const PERIODS = [
  { key: '', label: 'All' },
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
]

function Seg({ label, value, options, onChange }) {
  return (
    <div className="fr-group" role="group" aria-label={label}>
      <span className="fr-label">{label}</span>
      <div className="fr-seg">
        {options.map((o) => (
          <button key={o.key || 'all'} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
            {o.glyph && <i className={`lg ${o.glyph}`} aria-hidden="true" />}
            {o.label}
            {o.n != null && <span className="fr-n">{o.n}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function FilterRail({ show, model, filters, setFilters, onSearch, sel, select, anchor }) {
  const counts = useMemo(() => {
    if (!model) return null
    const tone = { pos: 0, neu: 0, neg: 0 }
    const plat = {}
    for (const m of model.mentions) {
      if (matches(m, { ...filters, tone: '' })) tone[m.tone]++
      if (matches(m, { ...filters, platform: '' })) plat[m.platform] = (plat[m.platform] || 0) + 1
    }
    return { tone, plat }
  }, [model, filters])

  const set = (patch) => setFilters({ ...filters, ...patch })
  const setPeriod = (key) => {
    const p = PERIODS.find((x) => x.key === key)
    // Offline, periods count back from when the snapshot was taken.
    set({ period: key, since: p && p.days ? (anchor || Date.now()) - p.days * DAY : null, until: null })
  }
  const custom = filters.period === 'custom'

  return (
    <div className={`filter-rail${show ? ' is-on' : ''}`} aria-hidden={show ? undefined : 'true'}>
      <div className="fr-inner">
        <button type="button" className="fr-search" onClick={onSearch} disabled={!model}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Search
          <kbd>⌘K</kbd>
        </button>

        {sel.ticker && (
          <button type="button" className="fr-active" onClick={() => select(null)} aria-label={`Clear ${sel.ticker} selection`}>
            <span className="mono">{sel.ticker}</span>
            <span aria-hidden="true">×</span>
          </button>
        )}

        <Seg
          label="Tone"
          value={filters.tone}
          onChange={(v) => set({ tone: v })}
          options={[
            { key: '', label: 'All' },
            { key: 'pos', label: 'Positive', glyph: 'pos', n: counts?.tone.pos },
            { key: 'neu', label: 'Neutral', glyph: 'neu', n: counts?.tone.neu },
            { key: 'neg', label: 'Negative', glyph: 'neg', n: counts?.tone.neg },
          ]}
        />
        <Seg
          label="Source"
          value={filters.platform}
          onChange={(v) => set({ platform: v })}
          options={[
            { key: '', label: 'All' },
            ...(model ? model.platforms : ['truth_social', 'x']).map((p) => ({ key: p, label: platformLabel(p) })),
          ]}
        />
        <label className="fr-group fr-select">
          <span className="fr-label">Official</span>
          <select value={filters.official} onChange={(e) => set({ official: e.target.value })} disabled={!model}>
            <option value="">All officials</option>
            {model?.officials.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        {custom ? (
          <div className="fr-group">
            <span className="fr-label">Period</span>
            <button type="button" className="fr-active" onClick={() => setPeriod('')}>
              <span className="mono">
                {filters.since != null ? fmtDate(filters.since) : '…'} – {filters.until != null ? fmtDate(filters.until) : '…'}
              </span>
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : (
          <Seg label="Period" value={filters.period || ''} onChange={setPeriod} options={PERIODS} />
        )}

        {isFiltered(filters) && (
          <button type="button" className="fr-reset" onClick={() => setFilters(EMPTY_FILTERS)}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
