// Deterministic cluster layout. Positions are in stage-height units with the
// stage centre at (0, 0); x spans roughly ±aspect/2. Cluster size follows the
// company's mention count and nothing else.

export function hash01(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

export const clusterRadius = (count, max, compact = false) =>
  (count > 0 ? 0.03 + 0.085 * Math.sqrt(count / Math.max(1, max)) : 0.018) * (compact ? 0.62 : 1)

// Node labels are drawn at 15–32px (12–22px on phones; see engine
// placeLabels). Their width in stage-height units depends on the stage's
// pixel height.
export const labelPx = (count, max, compact = false) =>
  compact ? 12 + 10 * Math.sqrt(count / Math.max(1, max)) : 15 + 17 * Math.sqrt(count / Math.max(1, max))

export function layoutClusters(companies, links, aspect, { avoid = [], center = [0, 0], unitPx = 700, compact = false } = {}) {
  const max = Math.max(1, ...companies.map((c) => c.count))
  const n = companies.length
  const halfW = aspect / 2
  const labelW = (c) => {
    const px = labelPx(c.count, max, compact)
    const count = String(c.count).length * 0.32 + 0.3
    return (12 + px * (c.ticker.length * 0.64 + count)) / unitPx
  }
  const nodes = companies.map((c, i) => {
    const a = i * 2.39996 + 0.6
    const d = 0.09 + 0.2 * Math.sqrt((i + 0.5) / Math.max(1, n))
    // Phones: a two-column zigzag down the free band between the overlay's
    // top bar and its headline, instead of a spiral.
    if (compact) {
      const col = i % 2
      const top = Math.max(-0.45, ...avoid.filter((a) => a[3] < 0).map((a) => a[3])) + 0.05
      const bottom = Math.min(0.45, ...avoid.filter((a) => a[1] > 0).map((a) => a[1])) - 0.05
      return {
        ticker: c.ticker,
        r: clusterRadius(c.count, max, true),
        lw: labelW(c),
        x: center[0] + (col ? aspect * 0.06 : -aspect * 0.3),
        y: top + (i + 0.5) * ((bottom - top) / Math.max(1, n)),
        z: (hash01(c.ticker) - 0.5) * 0.2,
      }
    }
    return {
      ticker: c.ticker,
      r: clusterRadius(c.count, max),
      lw: labelW(c),
      x: center[0] + Math.cos(a) * d * Math.min(aspect, 1.9) * 1.05,
      y: center[1] + Math.sin(a) * d,
      z: (hash01(c.ticker) - 0.5) * 0.34,
    }
  })
  const idx = new Map(nodes.map((nd, i) => [nd.ticker, i]))
  const edges = links.filter((l) => idx.has(l.a) && idx.has(l.b)).map((l) => [idx.get(l.a), idx.get(l.b), l.n])

  const margin = compact ? 0.035 : 0.07
  for (let it = 0; it < 420; it++) {
    const cool = 1 - it / 420
    // footprint: circle plus the label to its right (phones keep their
    // zigzag, which is already spaced by construction)
    for (let i = 0; i < (compact ? 0 : n); i++) {
      const a = nodes[i]
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        const ax = a.x + a.lw * 0.5
        const bx = b.x + b.lw * 0.5
        const dx = (ax - bx) * 0.72
        const dy = a.y - b.y
        const d = Math.hypot(dx, dy) || 1e-4
        const want = a.r + b.r + (a.lw + b.lw) * 0.36 + 0.05
        if (d < want) {
          const f = ((want - d) / d) * 0.5 * (0.35 + cool * 0.4)
          a.x += dx * f
          a.y += dy * f
          b.x -= dx * f
          b.y -= dy * f
        }
      }
    }
    for (const [i, j, w] of edges) {
      const a = nodes[i]
      const b = nodes[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const f = compact ? 0 : 0.0035 * Math.min(4, w) * cool
      a.x += dx * f
      a.y += dy * f
      b.x -= dx * f
      b.y -= dy * f
    }
    for (const nd of nodes) {
      nd.x += (center[0] - nd.x) * (compact ? 0 : 0.012)
      nd.y += (center[1] - nd.y) * (compact ? 0 : 0.02)
      for (const [x0, y0, x1, y1] of avoid) {
        const lh = Math.max(nd.r, 0.03)
        const L = nd.x - nd.r
        const R = nd.x + nd.r + nd.lw
        const T = nd.y - lh
        const B = nd.y + lh
        if (R > x0 && L < x1 && B > y0 && T < y1) {
          // leave by the shortest way out that stays on the stage
          const ways = [
            [x1 - L, 1, 0, x1 + nd.r + nd.lw < halfW - margin],
            [R - x0, -1, 0, x0 - nd.r - nd.lw > -halfW + margin],
            [y1 - T, 0, 1, y1 + lh < 0.5 - margin],
            [B - y0, 0, -1, y0 - lh > -0.5 + margin],
          ].filter((w) => w[3])
          if (ways.length) {
            const [d, dx, dy] = ways.reduce((a, b) => (b[0] < a[0] ? b : a))
            nd.x += dx * d * 0.25
            nd.y += dy * d * 0.25
          }
        }
      }
      nd.x = Math.max(-halfW + margin + nd.r, Math.min(halfW - margin - nd.r - nd.lw, nd.x))
      nd.y = Math.max(-0.5 + margin + nd.r, Math.min(0.5 - margin - nd.r, nd.y))
    }
  }
  return new Map(nodes.map((nd) => [nd.ticker, nd]))
}
