import React from 'react'
const PIPELINE = [
  {
    n: '01',
    name: 'Collect',
    text: 'Original posts from tracked Truth Social and X accounts. Replies and reposts are skipped.',
    src: 'ingest/',
  },
  {
    n: '02',
    name: 'Detect',
    text: 'Cashtags, unambiguous bare tickers and exact company names from the SEC ticker list. Nothing is inferred from phrases like “big tech”.',
    src: 'analysis/tickers.py',
  },
  {
    n: '03',
    name: 'Score',
    text: 'VADER compound tone from −1 to +1. Positive at 0.25 and above, negative at −0.25 and below.',
    src: 'analysis/sentiment.py',
  },
  {
    n: '04',
    name: 'Flag',
    text: 'A post is kept when it names a company and either scores 0.25 or higher or uses promotional wording.',
    src: 'analysis/sentiment.py',
  },
  {
    n: '05',
    name: 'Compare',
    text: 'Daily closes around the post: +1, +7 and +30 days against the close on or before its date.',
    src: 'analysis/prices.py',
  },
]

export default function Method({ csv }) {
  return (
    <section className="section method" id="method" aria-labelledby="method-h">
      <div className="container">
        <div className="section-head">
          <p className="kicker">05 — Method</p>
          <h2 id="method-h">How a post becomes a signal.</h2>
        </div>
        <ol className="pipeline">
          {PIPELINE.map((s) => (
            <li key={s.n}>
              <span className="pl-n">{s.n}</span>
              <span className="pl-dot" aria-hidden="true" />
              <h3>{s.name}</h3>
              <p>{s.text}</p>
              <code>{s.src}</code>
            </li>
          ))}
        </ol>

        <div className="limits">
          <div className="limits-head">
            <p className="kicker">Read with care</p>
            <p className="limits-lede">
              Signal Dash lines up what officials said with what prices did. It does not show that one caused the other.
            </p>
          </div>
          <ul>
            <li>
              <strong>Timing is not cause.</strong> A price move after a post also reflects earnings, rates, sector news and
              everything else that happened that day.
            </li>
            <li>
              <strong>Daily closes only.</strong> A same-day move can’t be split into before and after the post, so the base close
              can fall a few hours after it.
            </li>
            <li>
              <strong>Name matching can misfire.</strong> Ordinary words that are also company names get matched. In the demo,
              “bullish” resolves to Bullish (BLSH) and “team” to Team Inc. (TISI). Cashtags are the most reliable match.
            </li>
            <li>
              <strong>Tone is a lexicon score.</strong> VADER is general-purpose; it can miss sarcasm and finance-specific
              wording.
            </li>
            <li>
              <strong>Not investment advice.</strong> This is a research and transparency tool.
            </li>
          </ul>
          <a className="btn-primary" href={csv.href} download={csv.download}>
            Export mentions with +1 / +7 / +30-day changes <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  )
}
