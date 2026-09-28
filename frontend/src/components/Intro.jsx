import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { useCountUp } from '../lib/motion.js'
import { plural } from '../lib/format.js'
import { REASON } from './SourceChip.jsx'

export const STEPS = [
  { n: '01', name: 'Noise', text: 'Posts arrive from tracked accounts. Most never name a company.' },
  { n: '02', name: 'Signal', text: 'A post that names a listed company becomes a signal.' },
  { n: '03', name: 'Entity', text: 'Its cashtag or company name is matched to an SEC ticker.' },
  { n: '04', name: 'Tone', text: 'The wording gets a VADER tone score from −1 to +1.' },
  { n: '05', name: 'Market', text: 'Daily closes around the post are laid beside it.' },
]

export function DataSentence({ mentions, posts }) {
  return (
    <>
      <span className="num">{mentions}</span> company {plural(mentions, 'mention')}
      <br />
      in <span className="num">{posts}</span> flagged {plural(posts, 'post')}.
    </>
  )
}

// Keeps the outgoing sentence on screen briefly so the swap reads as one motion.
function Swap({ id, children }) {
  const [prev, setPrev] = useState(null)
  const last = useRef({ id, children })
  useEffect(() => {
    if (last.current.id !== id) {
      setPrev(last.current)
      const t = setTimeout(() => setPrev(null), 700)
      last.current = { id, children }
      return () => clearTimeout(t)
    }
    last.current = { id, children }
    return undefined
  }, [id, children])
  return (
    <>
      {prev && (
        <span className="swap-out" aria-hidden="true" key={`o-${prev.id}`}>
          {prev.children}
        </span>
      )}
      <span className="swap-in" key={`i-${id}`}>
        {children}
      </span>
    </>
  )
}

const Intro = forwardRef(function Intro({ model, loaded, load, step, intro, onSkip, onRetry, reduced }, h1Ref) {
  const mentions = useCountUp(model ? model.mentions.length : 0, { duration: 1700 })
  const posts = useCountUp(model ? model.posts.length : 0, { duration: 1700 })
  const waiting = !model && load.phase !== 'error'
  const showSteps = waiting && step > 0 && !reduced
  const showSkip = intro === 'full'

  useEffect(() => {
    if (!showSkip) return undefined
    const onKey = (e) => e.key === 'Escape' && onSkip()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSkip, onSkip])

  return (
    <div className={`intro is-${intro}`}>
      <div className="intro-inner">
        <p className="kicker">
          Signal Dash <i>/</i> Company mentions by U.S. officials
        </p>
        <h2 ref={h1Ref} className="intro-h1">
          <Swap id={model ? 'data' : load.phase === 'error' ? 'error' : 'noise'}>
            {model ? (
              <DataSentence mentions={mentions} posts={posts} />
            ) : load.phase === 'error' ? (
              <>
                The data service
                <br />
                didn’t respond.
              </>
            ) : (
              <>
                Officials post all day.
                <br />
                Most of it is noise.
              </>
            )}
          </Swap>
        </h2>

        <div className={`intro-steps${showSteps ? ' is-on' : ''}`} aria-hidden={!showSteps}>
          <p className="kicker">How a signal is found</p>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.n} className={step === i + 1 ? 'is-current' : step > i + 1 ? 'is-past' : ''}>
                <span className="sp-n">{s.n}</span>
                <span className="sp-name">{s.name}</span>
                <span className="sp-text">{s.text}</span>
              </li>
            ))}
          </ol>
        </div>

        <LoadStatus load={load} model={loaded} onRetry={onRetry} />
      </div>

      {showSkip && (
        <button type="button" className="skip" onClick={onSkip}>
          {loaded ? 'Enter dashboard' : 'Skip intro'} <span aria-hidden="true">↘</span>
        </button>
      )}
    </div>
  )
})

export default Intro

export function Elapsed({ s }) {
  const m = Math.floor(s / 60)
  const ss = String(Math.floor(s % 60)).padStart(2, '0')
  return (
    <span className="mono elapsed">
      {m}:{ss}
    </span>
  )
}

// Only states the app is actually in; no invented progress.
export function LoadStatus({ load, model, onRetry, compact }) {
  let body
  if (model) {
    const counts = `${model.posts.length} flagged ${plural(model.posts.length, 'post')} · ${model.mentions.length} ${plural(
      model.mentions.length,
      'mention',
    )} · ${model.companyOrder.length} ${plural(model.companyOrder.length, 'company', 'companies')}`
    body =
      load.source === 'snapshot' ? (
        <div className="status is-ready is-offline">
          <p>
            <span className="dot" aria-hidden="true" />
            Loaded the offline snapshot · {counts}
          </p>
          {load.reason !== 'static' && (
            <p className="status-note">
              The live API {REASON[load.reason] || 'didn’t answer'}. Prices are real daily closes up to the snapshot date.
            </p>
          )}
        </div>
      ) : (
        <p className="status is-ready">
          <span className="dot" aria-hidden="true" />
          Loaded {counts}
        </p>
      )
  } else if (load.phase === 'error') {
    body = (
      <div className="status is-error">
        <p>
          <span className="dot" aria-hidden="true" />
          No response after <Elapsed s={load.elapsed} />. It may still be starting.
        </p>
        <button type="button" className="btn-light" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  } else if (load.phase === 'waking') {
    body = (
      <div className="status is-waking">
        <p>
          <span className="dot" aria-hidden="true" />
          Waking the data service <Elapsed s={load.elapsed} />
        </p>
        {!compact && (
          <p className="status-note">
            The API runs on free hosting that sleeps when idle. If it isn’t up within a few seconds, the bundled snapshot loads
            instead.
          </p>
        )}
      </div>
    )
  } else {
    body = (
      <p className="status is-connecting">
        <span className="dot" aria-hidden="true" />
        Connecting to the data service
      </p>
    )
  }
  return (
    <div className="load-status" role="status" aria-live="polite">
      {body}
    </div>
  )
}
