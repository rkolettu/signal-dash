import React, { forwardRef, useMemo } from 'react'
import { useCountUp } from '../lib/motion.js'
import { fmtRange, plural } from '../lib/format.js'
import { isFiltered } from '../lib/data.js'
import { DataSentence, LoadStatus } from './Intro.jsx'
import Timeline from './Timeline.jsx'

export function ToneLegend({ compact }) {
  return (
    <ul className="legend" aria-label="Legend">
      <li>
        <i className="lg pos" aria-hidden="true" />
        Positive
      </li>
      <li>
        <i className="lg neu" aria-hidden="true" />
        Neutral
      </li>
      <li>
        <i className="lg neg" aria-hidden="true" />
        Negative
      </li>
      {!compact && <li className="lg-note">tone of the post</li>}
    </ul>
  )
}

const FieldOverlay = forwardRef(function FieldOverlay(
  { model, load, agg, visible, view, setView, compact, engine, heroRef, mode, filters, setFilters, select, onRetry },
  headlineRef,
) {
  const stats = useMemo(() => {
    if (!model) return null
    const posts = new Set()
    const officials = new Set()
    let first = Infinity
    let last = -Infinity
    let n = 0
    for (const m of model.mentions) {
      if (visible && !visible.has(m.id)) continue
      n++
      posts.add(m.post.id)
      officials.add(m.official)
      first = Math.min(first, m.t)
      last = Math.max(last, m.t)
    }
    return {
      mentions: n,
      posts: posts.size,
      officials: officials.size,
      companies: [...agg.values()].filter((a) => a.count).length,
      first,
      last,
    }
  }, [model, visible, agg])

  const mentions = useCountUp(stats?.mentions ?? 0)
  const posts = useCountUp(stats?.posts ?? 0)
  const filtered = isFiltered(filters)

  return (
    <div className={`su su-field is-${mode}`}>
      <div className="su-top">
        <div className="su-intro">
          <p className="kicker">{mode === 'timeline' ? 'Timeline' : 'Signal field'}</p>
          <p className="su-desc">
            {mode === 'timeline'
              ? 'Every mention by time, one lane per company. Drag across the lanes to narrow the date range.'
              : 'Each point is one company mention in a flagged post. Clusters grow with the number of mentions.'}
          </p>
        </div>
        <div className="su-controls">
          <ToneLegend compact={compact} />
          {!compact && (
            <div className="seg" role="group" aria-label="Arrange mentions">
              <button type="button" aria-pressed={view === 'clusters'} onClick={() => setView('clusters')}>
                Clusters
              </button>
              <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>
                Timeline
              </button>
            </div>
          )}
        </div>
      </div>

      {mode === 'timeline' && model && (
        <Timeline
          model={model}
          visible={visible}
          engine={engine}
          heroRef={heroRef}
          filters={filters}
          setFilters={setFilters}
          select={select}
        />
      )}

      <div className="su-bottom">
        <div className="su-head">
          {model ? (
            <h2 ref={headlineRef} className="headline">
              <DataSentence mentions={mentions} posts={posts} />
            </h2>
          ) : (
            <div className="su-wait">
              <h2 className="headline is-waiting">Waiting for data.</h2>
              <LoadStatus load={load} model={null} onRetry={onRetry} compact={compact} />
            </div>
          )}
          {stats && (
            <p className="su-meta">
              <span>
                {stats.companies} {plural(stats.companies, 'company', 'companies')}
              </span>
              <span>
                {stats.officials} {plural(stats.officials, 'official')}
              </span>
              {stats.mentions > 0 && <span>{fmtRange(stats.first, stats.last)}</span>}
              {filtered && <span className="is-accent">filtered from {model.mentions.length}</span>}
              {load.source === 'snapshot' && <span className="is-offline">offline snapshot</span>}
            </p>
          )}
        </div>
        {model && mode === 'field' && (
          <p className="su-hint">
            {compact ? 'Tap a company' : 'Select a company'} to see its daily closes around each mention
            <span aria-hidden="true"> ↗</span>
          </p>
        )}
      </div>
    </div>
  )
})

export default FieldOverlay
