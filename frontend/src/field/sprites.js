// Pre-rendered particle sprites. Blur is baked in with the shadow trick
// (draw the shape off-canvas, keep only its shadow) because canvas `filter`
// is not available in every Safari version.

export const BLUR_LEVELS = [0, 1.6, 3.4, 6, 10]
const BASE_R = 3 // sprite radius in CSS px at scale 1
const SS = 2 // supersample so sprites stay crisp on 2x screens

export const INK_TONES = {
  noise: [244, 241, 234],
  pos: [132, 206, 170],
  neu: [232, 226, 214],
  neg: [236, 128, 116],
  blue: [120, 156, 255],
}

function shape(g, kind, r) {
  g.beginPath()
  if (kind === 'ring') {
    g.arc(0, 0, r * 0.82, 0, Math.PI * 2)
    g.lineWidth = r * 0.42
    g.stroke()
    return
  }
  if (kind === 'diamond') {
    const k = r * 1.18
    g.moveTo(0, -k)
    g.lineTo(k, 0)
    g.lineTo(0, k)
    g.lineTo(-k, 0)
    g.closePath()
  } else {
    g.arc(0, 0, r, 0, Math.PI * 2)
  }
  g.fill()
}

function sprite(kind, rgb, blur) {
  const pad = Math.ceil(BASE_R * 1.3 + blur * 2 + 2)
  const size = pad * 2
  const c = document.createElement('canvas')
  c.width = c.height = size * SS
  const g = c.getContext('2d')
  g.scale(SS, SS)
  const col = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
  g.fillStyle = col
  g.strokeStyle = col
  if (blur === 0) {
    g.translate(pad, pad)
    shape(g, kind, BASE_R)
  } else {
    const off = 4000
    g.shadowColor = col
    g.shadowBlur = blur * 2 * SS
    g.shadowOffsetX = off * SS
    g.translate(pad - off, pad)
    // A blurred ring reads as a soft dot anyway; keep the silhouette hint.
    shape(g, kind, BASE_R)
  }
  return { img: c, half: pad }
}

function glow(rgb, radius, a0) {
  const size = radius * 2
  const c = document.createElement('canvas')
  c.width = c.height = size * SS
  const g = c.getContext('2d')
  g.scale(SS, SS)
  const grd = g.createRadialGradient(radius, radius, 0, radius, radius, radius)
  grd.addColorStop(0, `rgba(${rgb},${a0})`)
  grd.addColorStop(0.35, `rgba(${rgb},${a0 * 0.35})`)
  grd.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  return { img: c, half: radius }
}

export function makeSprites() {
  const set = (kind, rgb) => BLUR_LEVELS.map((b) => sprite(kind, rgb, b))
  return {
    BASE_R,
    noise: set('dot', INK_TONES.noise),
    pos: set('dot', INK_TONES.pos),
    neu: set('ring', INK_TONES.neu),
    neg: set('diamond', INK_TONES.neg),
    blue: set('dot', INK_TONES.blue),
    glowBlue: glow(INK_TONES.blue.join(','), 28, 0.55),
    halo: glow(INK_TONES.noise.join(','), 64, 0.07),
  }
}
