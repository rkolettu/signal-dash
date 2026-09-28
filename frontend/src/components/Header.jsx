import React, { useEffect, useState } from 'react'
import SourceChip from './SourceChip.jsx'

const SECTIONS = [
  { id: 'field', num: '01', name: 'Signal field' },
  { id: 'companies', num: '02', name: 'Companies' },
  { id: 'statements', num: '03', name: 'Statements' },
  { id: 'flagged', num: '04', name: 'Flagged days' },
  { id: 'method', num: '05', name: 'Method' },
]

// Portfolio-style corner header: brand, the section you are reading, links.
export default function Header({ intro, demo, csv, source, children }) {
  const [current, setCurrent] = useState(SECTIONS[0])
  useEffect(() => {
    if (intro === 'full') return undefined
    let raf = 0
    const update = () => {
      raf = 0
      const line = window.innerHeight * 0.4
      let cur = SECTIONS[0]
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= line) cur = s
      }
      setCurrent((p) => (p === cur ? p : cur))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [intro])

  return (
    <header className={`site-header${intro === 'full' ? ' on-ink' : ''}`}>
      <div className="header-row">
        <a className="brand" href="#field" aria-label="Signal Dash, top of page">
          Signal <i>/</i> Dash
          {demo && <span className="brand-tag">Demo data</span>}
        </a>
        <span className="header-status" aria-hidden="true">
          <span className="status-num">{current.num} / 05</span>
          <span className="status-name" key={current.id}>
            {current.name}
          </span>
        </span>
        <nav aria-label="Sections">
          <a className="nav-section" href="#companies">
            Companies
          </a>
          <a className="nav-section" href="#statements">
            Statements
          </a>
          <a className="nav-section" href="#method">
            Method
          </a>
          <SourceChip source={source} />
          <a className="nav-csv" href={csv.href} download={csv.download}>
            CSV <span aria-hidden="true">↓</span>
          </a>
        </nav>
      </div>
      {children}
    </header>
  )
}
