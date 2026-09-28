import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fmtDate, plural } from '../lib/format.js'

// ⌘K: jump to a company, filter by an official, or find a statement.
export default function CommandMenu({ model, agg, onClose, onCompany, onMention, onOfficial }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef(null)
  const listRef = useRef(null)
  const restore = useRef(typeof document !== 'undefined' ? document.activeElement : null)

  useEffect(() => {
    input.current?.focus()
    const prev = restore.current
    return () => prev && prev.focus && prev.focus()
  }, [])

  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = []
    for (const t of model.companyOrder) {
      const c = model.companies.get(t)
      if (!s || t.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)) {
        const n = agg.get(t)?.count || 0
        out.push({
          kind: 'Company',
          key: `c-${t}`,
          main: t,
          sub: `${c.name} · ${n} ${plural(n, 'mention')}`,
          run: () => onCompany(t),
        })
      }
    }
    for (const o of model.officials) {
      if (!s || o.toLowerCase().includes(s)) {
        out.push({ kind: 'Official', key: `o-${o}`, main: o, sub: 'Filter to this official', run: () => onOfficial(o) })
      }
    }
    if (s.length >= 2) {
      let n = 0
      for (let i = model.mentions.length - 1; i >= 0 && n < 8; i--) {
        const m = model.mentions[i]
        if (m.post.text.toLowerCase().includes(s)) {
          n++
          out.push({
            kind: 'Statement',
            key: `m-${m.id}`,
            main: `${m.ticker} · ${fmtDate(m.t)}`,
            sub: m.post.text,
            run: () => onMention(m),
          })
        }
      }
    }
    return out.slice(0, 40)
  }, [q, model, agg, onCompany, onMention, onOfficial])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (it) => {
    onClose()
    it.run()
  }
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault()
      run(items[active])
    } else if (e.key === 'Tab') {
      e.preventDefault()
    }
  }

  return (
    <div className="cmd-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKey}>
        <div className="cmd-input">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ticker, company, official or words in a post"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={items[active] ? `cmd-${items[active].key}` : undefined}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="cmd-list" id="cmd-list" role="listbox" ref={listRef}>
          {items.length === 0 && <li className="cmd-empty">Nothing matches “{q}”.</li>}
          {items.map((it, i) => (
            <li
              key={it.key}
              id={`cmd-${it.key}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => run(it)}
            >
              <span className="cmd-kind">{it.kind}</span>
              <span className="cmd-main">{it.main}</span>
              <span className="cmd-sub">{it.sub}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
