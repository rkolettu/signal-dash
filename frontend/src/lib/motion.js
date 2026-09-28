import { useEffect, useRef, useState } from 'react'

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
export const lerp = (a, b, k) => a + (b - a) * k

// Same curve as the portfolio's --ease-out: cubic-bezier(0.22, 1, 0.36, 1).
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 4)
export const easeInOut = (t) => {
  t = clamp(t)
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
}

const reducedQuery = () =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export function prefersReducedMotion() {
  const q = reducedQuery()
  return Boolean(q && q.matches)
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    const q = reducedQuery()
    if (!q) return undefined
    const on = () => setReduced(q.matches)
    q.addEventListener ? q.addEventListener('change', on) : q.addListener(on)
    return () => (q.removeEventListener ? q.removeEventListener('change', on) : q.removeListener(on))
  }, [])
  return reduced
}

export function useMedia(query, fallback = false) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : fallback)
  const [v, setV] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const q = window.matchMedia(query)
    const on = () => setV(q.matches)
    on()
    q.addEventListener ? q.addEventListener('change', on) : q.addListener(on)
    return () => (q.removeEventListener ? q.removeEventListener('change', on) : q.removeListener(on))
  }, [query])
  return v
}

// Smoothly counts toward `value` whenever it changes.
export function useCountUp(value, { duration = 900, decimals = 0 } = {}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef(0)
  useEffect(() => {
    if (value == null || Number.isNaN(value)) {
      setShown(value)
      return undefined
    }
    const start = performance.now()
    const a = from.current ?? 0
    if (reduced || a === value) {
      from.current = value
      setShown(value)
      return undefined
    }
    const tick = (now) => {
      const k = easeOut((now - start) / duration)
      const v = a + (value - a) * k
      const f = Math.pow(10, decimals)
      setShown(Math.round(v * f) / f)
      from.current = v
      if (k < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration, decimals, reduced])
  return shown
}

export function safeSession(key, value) {
  try {
    if (value === undefined) return window.sessionStorage.getItem(key)
    window.sessionStorage.setItem(key, value)
  } catch {
    /* storage can be unavailable (private mode, webviews) — fine to ignore */
  }
  return null
}
