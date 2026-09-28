import React, { useEffect, useRef, useState } from 'react'
import { fmtDate, fmtDateYear } from '../lib/format.js'

export const REASON = {
  slow: 'was still waking up after 12 seconds',
  unreachable: 'didn’t accept a connection',
  'not-api': 'isn’t connected to this deployment',
  timeout: 'didn’t answer in time',
  cancelled: 'didn’t answer',
}

// Where the data on screen came from, stated plainly, with a way back to
// the live API when it is (or becomes) available.
export default function SourceChip({ source }) {
  const { load, pendingLive, switchToLive, retry, snapshot, isStatic } = source
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const off = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) {
        // Escape closes only the popover, not the view behind it.
        if (e.type === 'keydown') e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', off)
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', off)
    }
  }, [open])
  if (!load.source) return null

  const offline = load.source === 'snapshot'
  const checking = load.phase !== 'ready'
  const taken = snapshot ? Date.parse(snapshot.generated_at) : null
  const label = pendingLive ? 'Live data ready' : offline ? `Snapshot · ${fmtDate(taken)}` : 'Live API'

  return (
    <span className="source" ref={ref}>
      <button
        type="button"
        className={`source-chip${offline ? ' is-offline' : ''}${pendingLive ? ' is-pending' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <i aria-hidden="true" />
        {checking && offline ? 'Checking…' : label}
      </button>
      {open && (
        <span className="source-pop" role="dialog" aria-label="Data source">
          {offline ? (
            <>
              <strong>Offline snapshot</strong>
              <span>
                {isStatic
                  ? 'This build serves the bundled demo dataset. '
                  : `The live API ${REASON[load.reason] || 'didn’t answer'}, so this is the bundled copy of the demo dataset. `}
                It was generated {fmtDateYear(taken)} by <code>backend/export_snapshot.py</code>: synthetic posts run through the
                real pipeline, with real Yahoo Finance daily closes up to that day.
              </span>
              {pendingLive ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    switchToLive()
                    setOpen(false)
                  }}
                >
                  Switch to live data
                </button>
              ) : (
                !isStatic && (
                  <button type="button" className="btn-secondary" onClick={retry} disabled={checking}>
                    {checking ? 'Checking the live API…' : 'Try the live API'}
                  </button>
                )
              )}
            </>
          ) : (
            <>
              <strong>Live API</strong>
              <span>
                Served by the Signal Dash backend. Daily closes come from Yahoo Finance when a company is opened. Posts in the
                demo deployment are synthetic samples.
              </span>
            </>
          )}
        </span>
      )}
    </span>
  )
}
