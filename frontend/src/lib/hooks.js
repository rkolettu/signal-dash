import { useLayoutEffect, useState } from 'react'

// Rect of `ref` relative to `heroRef`, kept current through resizes. Both
// scroll together, so the result is independent of page scroll.
export function useRelRect(ref, heroRef, deps = []) {
  const [rect, setRect] = useState(null)
  useLayoutEffect(() => {
    const el = ref.current
    const hero = heroRef.current
    if (!el || !hero) {
      setRect(null)
      return undefined
    }
    let raf = 0
    const measure = () => {
      raf = 0
      const a = el.getBoundingClientRect()
      const b = hero.getBoundingClientRect()
      const r = { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }
      setRect((p) =>
        p && Math.abs(p.x - r.x) < 0.5 && Math.abs(p.y - r.y) < 0.5 && Math.abs(p.w - r.w) < 0.5 && Math.abs(p.h - r.h) < 0.5
          ? p
          : r,
      )
    }
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(queue) : null
    ro?.observe(el)
    ro?.observe(hero)
    window.addEventListener('resize', queue)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', queue)
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return rect
}
