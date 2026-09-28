// Signal field: a Canvas 2D particle system with a small perspective camera.
//
// Every bright particle is one company mention returned by the API. Before
// data arrives, and around it afterwards, dim particles drift as "noise";
// they are decorative and never counted. Particles can sit in one of three
// placements and glide between them:
//   noise  — drifting with the background
//   orbit  — clustered around their company's node (3D, depth of field)
//   2d     — at a screen position supplied by the interface (timeline, chart)
import { makeSprites, BLUR_LEVELS } from './sprites.js'
import { layoutClusters, clusterRadius, hash01, labelPx } from './layout.js'

const TAU = Math.PI * 2
const CAM_D = 2.4
const LABEL_PX = 96 // node labels are laid out at 96px and scaled down (crisper than scaling up)
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOut = (t) => 1 - Math.pow(1 - c01(t), 4)
const easeInOut = (t) => {
  t = c01(t)
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
}
const easeInOut3 = (t) => {
  t = c01(t)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt))

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1000000) / 1000000
  }
}

export class SignalField {
  constructor(canvas, { frame, reduced = false, compact = false, onHover, onClick } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.frame = frame
    this.reduced = reduced
    this.compact = compact
    this.onHover = onHover || (() => {})
    this.onClick = onClick || (() => {})
    this.sprites = makeSprites()
    this.W = 0
    this.H = 0
    this.dpr = 1
    this.view = { x: 0, y: 0, w: 1, h: 1, r: 0 }
    this.viewTw = null
    this.cam = { fx: 0, fy: 0, fz: 0, zoom: 1, ax: 0.5, ay: 0.5, yaw: 0, pitch: 0 }
    this.camT = { fx: 0, fy: 0, fz: 0, zoom: 1, ax: 0.5, ay: 0.5 }
    this.pointer = { x: 0, y: 0, inside: false, down: null }
    this.noise = []
    this.parts = []
    this.byId = new Map()
    this.nodes = new Map()
    this.links = []
    this.labelEls = new Map()
    this.labelSlot = null
    this.targets = new Map()
    this.visible = null
    this.focus = null
    this.highlight = null
    this.selected = null
    this.hover = null
    this.phase = 'noise'
    this.concept = null
    this.avoid = []
    this.center = [0, 0]
    this.active = true
    this.raf = 0
    this.last = 0
    this.idle = 0
    this.t = 0
    this.random = rng(20260702)
    this.spawnNoise(compact ? 110 : 230)
    this.bind()
  }

  /* ---------------- setup ---------------- */

  bind() {
    const el = this.frame || this.canvas
    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    this.h_move = (e) => {
      const [x, y] = pos(e)
      this.pointer.x = x
      this.pointer.y = y
      this.pointer.inside = true
      this.pointer.touch = e.pointerType !== 'mouse'
      this.wake()
    }
    this.h_leave = () => {
      this.pointer.inside = false
      this.setHover(null)
      this.wake()
    }
    this.h_down = (e) => {
      const [x, y] = pos(e)
      this.pointer.down = { x, y }
      this.h_move(e)
    }
    this.h_up = (e) => {
      const d = this.pointer.down
      this.pointer.down = null
      if (!d) return
      const [x, y] = pos(e)
      if (Math.hypot(x - d.x, y - d.y) > 8) return
      // Touch has no hover, so resolve what is under the finger now.
      const hit = this.hitTest(x, y)
      if (hit) this.onClick(hit)
    }
    el.addEventListener('pointermove', this.h_move)
    el.addEventListener('pointerleave', this.h_leave)
    el.addEventListener('pointerdown', this.h_down)
    el.addEventListener('pointerup', this.h_up)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    const el = this.frame || this.canvas
    el.removeEventListener('pointermove', this.h_move)
    el.removeEventListener('pointerleave', this.h_leave)
    el.removeEventListener('pointerdown', this.h_down)
    el.removeEventListener('pointerup', this.h_up)
  }

  spawnNoise(n) {
    const R = this.random
    for (let i = 0; i < n; i++) {
      this.noise.push({
        x: (R() - 0.5) * 2.6,
        y: (R() - 0.5) * 1.5,
        z: -0.55 + R() * 2.4,
        ph: R() * TAU,
        sp: 0.35 + R() * 0.65,
        a: 0.3 + R() * 0.5,
        cur: null,
      })
    }
  }

  resize(W, H) {
    // Particles are soft sprites, so cap the backing store at ~6 MP; labels
    // and charts are DOM/SVG and stay sharp at any density.
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(6e6 / Math.max(1, W * H))))
    if (W === this.W && H === this.H && dpr === this.dpr) return
    this.W = W
    this.H = H
    this.dpr = dpr
    this.canvas.width = Math.round(W * dpr)
    this.canvas.height = Math.round(H * dpr)
    this.wake()
  }

  setView(rect, dur = 0) {
    const to = { ...rect, r: rect.r ?? 0 }
    if (!dur || this.reduced) {
      this.view = to
      this.viewTw = null
      this.applyClip()
    } else {
      this.viewTw = { from: { ...this.view }, to, t0: performance.now(), dur }
    }
    this.wake()
  }

  // Layout is computed for the docked stage's shape (not the current view),
  // so clusters scale smoothly while the loader docks. `avoid` keeps them
  // clear of interface text drawn over the stage.
  setLayout({ aspect, unitPx, avoid = [], center = [0, 0], concept = [0.2, 0.02] }) {
    this.conceptAt = concept
    const key = `${aspect.toFixed(3)}|${unitPx}|${this.compact}|${JSON.stringify(avoid)}|${center}`
    if (key === this.layoutKey) return
    this.layoutKey = key
    this.aspect = aspect
    this.unitPx = unitPx
    this.avoid = avoid
    this.center = center
    this.relayout()
    this.wake()
  }

  applyClip() {
    if (!this.frame) return
    const v = this.view
    const r = Math.max(0, this.W - (v.x + v.w))
    const b = Math.max(0, this.H - (v.y + v.h))
    const clip = `inset(${v.y.toFixed(1)}px ${r.toFixed(1)}px ${b.toFixed(1)}px ${v.x.toFixed(1)}px round ${v.r.toFixed(1)}px)`
    this.frame.style.clipPath = clip
    // Clip the canvas too: some compositors draw a GPU canvas layer without
    // its ancestor's rounded clip, leaving square corners.
    this.canvas.style.clipPath = clip
  }

  /* ---------------- data ---------------- */

  setData({ mentions, companies, links }) {
    const R = this.random
    const prev = this.byId
    this.byId = new Map()
    const list = []
    const order = [...mentions].sort((a, b) => a.t - b.t)
    order.forEach((m, i) => {
      let p = prev.get(m.id)
      if (!p) {
        // Pull a drifting noise particle out of the background to become
        // this mention, so the signal visibly comes from the noise.
        const src = this.noise.length > 40 ? this.noise.splice(Math.floor(R() * this.noise.length), 1)[0] : null
        const h = hash01(m.id)
        p = {
          id: m.id,
          ticker: m.ticker,
          tone: m.tone,
          nx: src ? src.x : (R() - 0.5) * 2.4,
          ny: src ? src.y : (R() - 0.5) * 1.4,
          nz: src ? src.z : -0.4 + R() * 2,
          ph: src ? src.ph : R() * TAU,
          sp: src ? src.sp : 0.5,
          th: h * TAU,
          tilt: Math.acos(2 * hash01(`${m.id}~`) - 1),
          rf: 0.34 + 0.66 * Math.sqrt(hash01(`${m.id}#`)),
          spin: (0.1 + 0.16 * hash01(`${m.id}%`)) * (h < 0.5 ? -1 : 1),
          place: 'noise',
          pending: null,
          tr: null,
          t2: null,
          cur: src && src.cur ? { ...src.cur, tone: 0 } : null,
          organized: false,
          hint: { delay: 0, dur: 1400 },
        }
      }
      p.idx = i
      p.tone = m.tone
      list.push(p)
      this.byId.set(m.id, p)
    })
    this.parts = list

    const byTicker = new Map()
    for (const c of companies) byTicker.set(c.ticker, c)
    this.companyList = companies
    this.links = links
    const old = this.nodes
    this.nodes = new Map()
    for (const c of companies) {
      const o = old.get(c.ticker)
      this.nodes.set(c.ticker, {
        ticker: c.ticker,
        total: c.total,
        count: c.total,
        x: 0,
        y: 0,
        z: 0,
        r: 0.05,
        rCur: o ? o.rCur : 0,
        alpha: o ? o.alpha : 0,
        showAt: o ? o.showAt : Infinity,
        sx: 0,
        sy: 0,
        rs: 0,
        s: 1,
        label: o ? o.label : null,
      })
    }
    this.relayout()
    this.recount()
    this.wake()
  }

  relayout() {
    if (!this.nodes.size || !this.view.h) return
    const aspect = this.aspect || this.view.w / this.view.h
    const comp = [...this.nodes.values()].map((n) => ({ ticker: n.ticker, count: n.total }))
    const lay = layoutClusters(comp, this.links, aspect, {
      avoid: this.avoid,
      center: this.center,
      unitPx: this.unitPx || this.view.h,
      compact: this.compact,
    })
    for (const n of this.nodes.values()) {
      const l = lay.get(n.ticker)
      n.x = l.x
      n.y = l.y
      n.z = l.z
      n.r = l.r
    }
    this.maxTotal = Math.max(1, ...[...this.nodes.values()].map((n) => n.total))
  }

  // Particles leave the noise and settle into their clusters, oldest first.
  organize({ spread = 1300, dur = 1600 } = {}) {
    this.phase = 'field'
    const n = this.parts.length
    const t0 = performance.now()
    this.parts.forEach((p) => {
      p.organized = true
      p.hint = {
        delay: this.reduced ? 0 : (p.idx / Math.max(1, n)) * spread + hash01(p.id) * 140,
        dur: this.reduced ? 1 : dur,
        ease: easeInOut3,
      }
    })
    for (const node of this.nodes.values()) {
      const first = this.parts.find((p) => p.ticker === node.ticker)
      node.showAt = first ? t0 + first.hint.delay + first.hint.dur * 0.6 : t0
    }
    this.wake()
  }

  setVisible(ids) {
    this.visible = ids
    this.recount()
    this.wake()
  }

  recount() {
    const counts = new Map()
    for (const p of this.parts) {
      if (!this.visible || this.visible.has(p.id)) counts.set(p.ticker, (counts.get(p.ticker) || 0) + 1)
    }
    for (const n of this.nodes.values()) n.count = counts.get(n.ticker) || 0
  }

  // Screen positions (hero px) for particles that should leave their cluster.
  setTargets(map, { dur = 1200, stagger = null, immediate = false } = {}) {
    const now = performance.now()
    for (const p of this.parts) {
      const q = map.get(p.id)
      const prev = p.t2 // last 2D position, kept even after targets are cleared
      const delay = this.reduced || immediate ? 0 : stagger ? stagger(p) : 0
      const d = this.reduced ? 1 : dur
      if (q) {
        const moved = prev && (Math.abs(prev.x - q.x) > 0.5 || Math.abs(prev.y - q.y) > 0.5)
        if (moved && !immediate && p.place === '2d' && p.cur) {
          p.tr = { fx: p.cur.x, fy: p.cur.y, t0: now + delay, dur: d, ease: easeInOut }
        }
        p.t2 = q
      }
      p.hint = { delay, dur: d }
    }
    this.targets = map
    this.wake()
  }

  setFocus(ticker, { anchor = [0.5, 0.5], zoom = 1.8 } = {}) {
    this.focus = ticker
    const n = ticker && this.nodes.get(ticker)
    if (n) {
      this.camT = { fx: n.x, fy: n.y, fz: n.z, zoom, ax: anchor[0], ay: anchor[1] }
    } else {
      this.camT = { fx: 0, fy: 0, fz: 0, zoom: 1, ax: 0.5, ay: 0.5 }
    }
    if (this.reduced) Object.assign(this.cam, this.camT)
    this.wake()
  }

  setHighlight(ticker) {
    this.highlight = ticker
    this.wake()
  }

  setSelected(id) {
    this.selected = id
    this.wake()
  }

  registerLabel(ticker, el) {
    if (el) this.labelEls.set(ticker, el)
    else this.labelEls.delete(ticker)
  }

  // Where the focused company's label should travel to (hero px, font px).
  setLabelSlot(slot) {
    this.labelSlot = slot
    this.wake()
  }

  setConcept(step) {
    if (step === this.concept?.step) return
    if (step == null) {
      if (this.concept) this.concept.out = performance.now()
    } else {
      const prev = this.concept && !this.concept.out ? this.concept : null
      this.concept = { step, t0: performance.now(), out: 0, born: prev ? prev.born : performance.now() }
    }
    this.wake()
  }

  setActive(on) {
    this.active = on
    if (on) this.wake()
  }

  setReduced(r) {
    this.reduced = r
    this.wake()
  }

  wake() {
    this.idle = 0
    if (!this.raf && this.active) {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  /* ---------------- projection ---------------- */

  project(x, y, z) {
    const c = this.cam
    let px = x - c.fx
    let py = y - c.fy
    let pz = z - c.fz
    const cy = Math.cos(c.yaw)
    const sy = Math.sin(c.yaw)
    let t = px * cy - pz * sy
    pz = px * sy + pz * cy
    px = t
    const cp = Math.cos(c.pitch)
    const sp = Math.sin(c.pitch)
    t = py * cp - pz * sp
    pz = py * sp + pz * cp
    py = t
    const s = CAM_D / Math.max(0.35, CAM_D + pz)
    const unit = this.view.h * c.zoom
    return {
      x: this.view.x + this.view.w * c.ax + px * s * unit,
      y: this.view.y + this.view.h * c.ay + py * s * unit,
      s,
      z: pz,
    }
  }

  /* ---------------- frame ---------------- */

  tick = (now) => {
    this.raf = 0
    if (!this.active) return
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000))
    this.last = now
    this.t += this.reduced ? 0 : dt
    let busy = this.step(now, dt)
    this.draw(now, dt)
    if (this.pointer.inside && !this.pointer.touch) this.setHover(this.hitTest(this.pointer.x, this.pointer.y))
    busy = busy || !this.reduced
    if (busy) this.idle = 0
    else this.idle++
    if (this.idle < 20) this.raf = requestAnimationFrame(this.tick)
  }

  step(now, dt) {
    let busy = false
    // stage rectangle (the loader docking into the dashboard)
    if (this.viewTw) {
      const { from, to, t0, dur } = this.viewTw
      const k = easeOut((now - t0) / dur)
      this.view = {
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        w: from.w + (to.w - from.w) * k,
        h: from.h + (to.h - from.h) * k,
        r: from.r + (to.r - from.r) * k,
      }
      this.applyClip()
      if (k >= 1) this.viewTw = null
      busy = true
    }

    // camera
    const c = this.cam
    const T = this.camT
    const rate = this.reduced ? 1000 : 2.6
    for (const k of ['fx', 'fy', 'fz', 'zoom', 'ax', 'ay']) {
      const v = approach(c[k], T[k], rate, dt)
      if (Math.abs(v - T[k]) > 1e-4) busy = true
      c[k] = v
    }
    let yaw = 0
    let pitch = 0
    if (!this.reduced) {
      yaw = Math.sin(this.t * 0.06) * 0.05
      pitch = Math.sin(this.t * 0.045 + 1) * 0.025
      if (this.pointer.inside && !this.pointer.touch && this.view.w > 0) {
        yaw += ((this.pointer.x - this.view.x) / this.view.w - 0.5) * 0.14
        pitch -= ((this.pointer.y - this.view.y) / this.view.h - 0.5) * 0.08
      }
      if (this.focus) {
        yaw *= 0.35
        pitch *= 0.35
      }
    }
    c.yaw = approach(c.yaw, yaw, 2, dt)
    c.pitch = approach(c.pitch, pitch, 2, dt)

    // nodes
    const hover = this.hover?.kind === 'node' ? this.hover.key : this.highlight
    for (const n of this.nodes.values()) {
      const base = clusterRadius(n.count, this.maxTotal, this.compact)
      const rT = n.count > 0 ? base * (hover === n.ticker ? 1.22 : 1) : base * 0.4
      n.rCur = this.reduced ? rT : approach(n.rCur, rT, 5, dt)
      if (Math.abs(n.rCur - rT) > 1e-4) busy = true
    }
    return busy
  }

  particleTarget(p, now) {
    const mode2d = this.targets.size > 0
    if (p.place === '2d') {
      const q = this.targets.get(p.id) || p.t2
      const sel = this.selected === p.id
      return {
        x: q.x,
        y: q.y,
        z: -2,
        size: (q.r ?? 3.4) * (sel ? 1.35 : 1),
        blur: 0,
        alpha: this.targets.has(p.id) ? (q.a ?? 1) : 0,
        tone: 1,
        glow: sel ? 1 : q.hl ? 0.6 : 0,
      }
    }
    if (p.place === 'noise') {
      const q = this.project(p.nx, p.ny + Math.sin(this.t * 0.3 * p.sp + p.ph) * 0.02, p.nz)
      return { x: q.x, y: q.y, z: q.z, size: 1.1 * q.s, blur: this.dof(q.z, 0), alpha: 0.5, tone: 0, glow: 0 }
    }
    // orbit
    const n = this.nodes.get(p.ticker)
    const R = n.rCur * p.rf
    const th = p.th + this.t * p.spin
    const sx = Math.sin(p.tilt)
    const q = this.project(n.x + Math.cos(th) * sx * R, n.y + Math.sin(th) * sx * R * 0.86, n.z + Math.cos(p.tilt) * R * 0.8)
    const shown = !this.visible || this.visible.has(p.id)
    const receded = this.focus && this.focus !== p.ticker
    const hot = (this.hover?.kind === 'node' && this.hover.key === p.ticker) || this.highlight === p.ticker
    let alpha = shown ? 0.95 : 0.1
    let extra = shown ? 0 : 1.2
    if (receded) {
      alpha *= 0.2
      extra += 1.8
    }
    if (mode2d && !this.focus) alpha *= 0.25
    const flash = p.flashAt && now - p.flashAt < 700 ? 1 - (now - p.flashAt) / 700 : 0
    return {
      x: q.x,
      y: q.y,
      z: q.z,
      size: 2.9 * q.s * Math.pow(this.cam.zoom, 0.5) * (hot ? 1.15 : 1),
      blur: this.dof(q.z, extra),
      alpha,
      tone: 1,
      glow: Math.max(flash, hot && shown ? 0.28 : 0),
    }
  }

  dof(z, extra) {
    return Math.min(BLUR_LEVELS.length - 1, Math.abs(z) * 6.5 * (0.7 + 0.3 * this.cam.zoom) + extra)
  }

  draw(now, dt) {
    const g = this.ctx
    const { W, H, dpr } = this
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    const items = []

    // background noise
    const focusDim = this.focus || this.targets.size ? 0.45 : this.phase === 'field' ? 0.75 : 1
    for (const q of this.noise) {
      if (!this.reduced) {
        q.x += 0.006 * q.sp * dt * 6
        q.y += Math.sin(this.t * 0.25 * q.sp + q.ph) * 0.0006
        if (q.x > 1.4) q.x = -1.4
      }
      const pr = this.project(q.x, q.y, q.z)
      const tgt = {
        x: pr.x,
        y: pr.y,
        z: pr.z,
        size: 1.05 * pr.s,
        blur: this.dof(pr.z, 0.4),
        alpha: q.a * focusDim,
        tone: 0,
        glow: 0,
      }
      q.cur = tgt
      if (pr.x < -20 || pr.x > W + 20 || pr.y < -20 || pr.y > H + 20) continue
      items.push(tgt)
    }

    // mention particles
    const mode2d = this.targets.size > 0
    for (const p of this.parts) {
      if (p.place === 'noise' && !this.reduced) {
        p.nx += 0.006 * p.sp * dt * 6
        if (p.nx > 1.4) p.nx = -1.4
      }
      const want = this.targets.has(p.id) ? '2d' : p.organized ? 'orbit' : 'noise'
      // a later request can cancel a move that hasn't started yet
      if (want === p.place && p.pending) p.pending = null
      if (want !== p.place && (!p.pending || p.pending.place !== want)) {
        p.pending = { place: want, t0: now + (p.hint?.delay || 0), dur: p.hint?.dur || 1200, ease: p.hint?.ease || easeInOut }
      }
      if (p.pending && now >= p.pending.t0) {
        const from = p.cur
        const wasNoise = p.place === 'noise'
        p.place = p.pending.place
        if (from) p.tr = { fx: from.x, fy: from.y, t0: p.pending.t0, dur: p.pending.dur, ease: p.pending.ease }
        if (wasNoise && p.place === 'orbit') p.flashAt = now
        p.pending = null
      }
      const tgt = this.particleTarget(p, now)
      const cur = p.cur || { ...tgt, alpha: 0, tone: 0 }
      let x = tgt.x
      let y = tgt.y
      if (p.tr) {
        const k = p.tr.ease((now - p.tr.t0) / p.tr.dur)
        if (now < p.tr.t0) {
          x = p.tr.fx
          y = p.tr.fy
        } else {
          x = p.tr.fx + (tgt.x - p.tr.fx) * k
          y = p.tr.fy + (tgt.y - p.tr.fy) * k
        }
        if (k >= 1) p.tr = null
        // lift toward the viewer while flying
        tgt.size *= 1 + Math.sin(Math.PI * k) * 0.35
      }
      const r = this.reduced ? 1000 : 7
      const out = {
        x,
        y,
        z: tgt.z,
        size: approach(cur.size, tgt.size, r, dt),
        blur: approach(cur.blur, tgt.blur, r, dt),
        alpha: approach(cur.alpha, tgt.alpha, this.reduced ? 1000 : 5, dt),
        tone: approach(cur.tone, tgt.tone, this.reduced ? 1000 : 4, dt),
        glow: approach(cur.glow || 0, tgt.glow, 8, dt),
        kind: p.tone,
        id: p.id,
      }
      p.cur = out
      items.push(out)
    }

    // nodes: project once for links, halos and labels
    const focusK = this.focus ? 1 : 0
    for (const n of this.nodes.values()) {
      const pr = this.project(n.x, n.y, n.z)
      n.sx = pr.x
      n.sy = pr.y
      n.s = pr.s
      n.rs = n.rCur * pr.s * this.view.h * this.cam.zoom
      let a = this.phase === 'field' && now >= n.showAt && n.count > 0 ? 1 : 0
      if (this.focus && this.focus !== n.ticker) a *= 0.16
      if (this.focus === n.ticker && mode2d) a = 0
      if (mode2d && !this.focus) a = 0
      n.alpha = approach(n.alpha, a, this.reduced ? 1000 : 4, dt)
    }

    // links between companies named in the same post
    if (this.links.length) {
      const maxN = Math.max(...this.links.map((l) => l.n))
      g.lineWidth = 1
      for (const l of this.links) {
        const a = this.nodes.get(l.a)
        const b = this.nodes.get(l.b)
        if (!a || !b) continue
        const al = Math.min(a.alpha, b.alpha) * (0.035 + 0.1 * (l.n / maxN)) * (1 - focusK * 0.8)
        if (al < 0.005) continue
        // edge to edge, fading toward the middle of the span
        const dx = b.sx - a.sx
        const dy = b.sy - a.sy
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const ax = a.sx + ux * (a.rs + 8)
        const ay = a.sy + uy * (a.rs + 8)
        const bx = b.sx - ux * (b.rs + 8)
        const by = b.sy - uy * (b.rs + 8)
        if ((bx - ax) * ux + (by - ay) * uy <= 0) continue
        const grd = g.createLinearGradient(ax, ay, bx, by)
        grd.addColorStop(0, `rgba(244,241,234,${(al * 1.6).toFixed(3)})`)
        grd.addColorStop(0.5, `rgba(244,241,234,${(al * 0.35).toFixed(3)})`)
        grd.addColorStop(1, `rgba(244,241,234,${(al * 1.6).toFixed(3)})`)
        g.strokeStyle = grd
        const mx = (ax + bx) / 2 + uy * len * 0.06
        const my = (ay + by) / 2 - ux * len * 0.06
        g.beginPath()
        g.moveTo(ax, ay)
        g.quadraticCurveTo(mx, my, bx, by)
        g.stroke()
      }
    }

    g.globalCompositeOperation = 'lighter'
    // halos
    const halo = this.sprites.halo
    for (const n of this.nodes.values()) {
      if (n.alpha < 0.01) continue
      const s = (n.rs * 2.3) / halo.half
      g.globalAlpha = n.alpha
      g.drawImage(halo.img, n.sx - halo.half * s, n.sy - halo.half * s, halo.half * 2 * s, halo.half * 2 * s)
    }

    items.sort((a, b) => b.z - a.z)
    const S = this.sprites
    for (const it of items) {
      if (it.alpha < 0.01) continue
      const lvl = Math.max(0, Math.min(BLUR_LEVELS.length - 1.001, it.blur))
      const i0 = Math.floor(lvl)
      const f = lvl - i0
      const scale = it.size / S.BASE_R
      const draw = (set, a) => {
        if (a < 0.01) return
        const s0 = set[i0]
        g.globalAlpha = a * (1 - f)
        g.drawImage(s0.img, it.x - s0.half * scale, it.y - s0.half * scale, s0.half * 2 * scale, s0.half * 2 * scale)
        if (f > 0.02) {
          const s1 = set[i0 + 1]
          g.globalAlpha = a * f
          g.drawImage(s1.img, it.x - s1.half * scale, it.y - s1.half * scale, s1.half * 2 * scale, s1.half * 2 * scale)
        }
      }
      if (it.glow > 0.02) {
        const gl = S.glowBlue
        const gs = (it.size * 4.2) / gl.half
        g.globalAlpha = it.alpha * it.glow
        g.drawImage(gl.img, it.x - gl.half * gs, it.y - gl.half * gs, gl.half * 2 * gs, gl.half * 2 * gs)
      }
      if (!it.kind) {
        draw(S.noise, it.alpha)
      } else {
        draw(S.noise, it.alpha * (1 - it.tone))
        draw(S[it.kind] || S.neu, it.alpha * it.tone)
      }
    }
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1

    // node cores and hover ring
    const hover = this.hover?.kind === 'node' ? this.hover.key : this.highlight
    for (const n of this.nodes.values()) {
      if (n.alpha < 0.01) continue
      g.fillStyle = `rgba(244,241,234,${(0.9 * n.alpha).toFixed(3)})`
      g.beginPath()
      g.arc(n.sx, n.sy, 1.7, 0, TAU)
      g.fill()
      if (hover === n.ticker && !this.focus) {
        g.strokeStyle = `rgba(120,156,255,${(0.45 * n.alpha).toFixed(3)})`
        g.setLineDash([2, 5])
        g.beginPath()
        g.arc(n.sx, n.sy, n.rs * 1.12 + 6, 0, TAU)
        g.stroke()
        g.setLineDash([])
      }
    }

    this.drawConcept(now)
    this.placeLabels(now, dt)
  }

  /* ---------------- labels ---------------- */

  placeLabels(now, dt) {
    for (const n of this.nodes.values()) {
      const el = this.labelEls.get(n.ticker)
      if (!el) continue
      const focused = this.focus === n.ticker && this.labelSlot
      let tgt
      if (focused) {
        const s = this.labelSlot
        tgt = { x: s.x, y: s.y, k: s.fontPx / LABEL_PX, a: 1 }
      } else {
        const px = labelPx(n.total, this.maxTotal, this.compact)
        const k = (px / LABEL_PX) * (0.86 + 0.14 * n.s)
        // other companies' labels leave entirely while one is in focus
        tgt = { x: n.sx + n.rs + 12, y: n.sy - (LABEL_PX * k) / 2, k, a: this.focus ? 0 : n.alpha }
      }
      const key = focused ? this.labelSlot : 'field'
      let L = n.label
      if (!L) {
        L = n.label = { ...tgt, key, tr: null }
      }
      if (L.key !== key) {
        // slot changes (e.g. company → event heading) glide too
        L.tr = {
          from: { x: L.x, y: L.y, k: L.k },
          t0: now,
          dur: this.reduced ? 1 : L.key === 'field' || key === 'field' ? 1050 : 800,
        }
        L.key = key
      }
      let { x, y, k } = tgt
      if (L.tr) {
        const e = easeInOut((now - L.tr.t0) / L.tr.dur)
        x = L.tr.from.x + (tgt.x - L.tr.from.x) * e
        y = L.tr.from.y + (tgt.y - L.tr.from.y) * e
        k = L.tr.from.k + (tgt.k - L.tr.from.k) * e
        if (e >= 1) L.tr = null
      }
      // magnetic pull toward the pointer while its cluster is hovered
      const hovered =
        !focused &&
        !this.reduced &&
        this.pointer.inside &&
        ((this.hover?.kind === 'node' && this.hover.key === n.ticker) || this.highlight === n.ticker)
      const tx = hovered ? Math.max(-7, Math.min(7, (this.pointer.x - (x + 20)) * 0.06)) : 0
      const ty = hovered ? Math.max(-5, Math.min(5, (this.pointer.y - (y + LABEL_PX * k * 0.5)) * 0.06)) : 0
      L.mx = approach(L.mx || 0, tx, 10, dt)
      L.my = approach(L.my || 0, ty, 10, dt)
      x += L.mx
      y += L.my
      L.x = x - L.mx
      L.y = y - L.my
      L.k = k
      L.a = approach(L.a ?? 0, tgt.a, this.reduced ? 1000 : 6, dt)
      const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${k.toFixed(4)})`
      const op = L.a.toFixed(2)
      if (tf !== L.tf) el.style.transform = L.tf = tf
      if (op !== L.op) {
        el.style.opacity = L.op = op
        el.style.visibility = L.a < 0.02 ? 'hidden' : 'visible'
        el.style.pointerEvents = L.a > 0.6 ? 'auto' : 'none'
      }
    }
  }

  /* ---------------- concept loop (cold start) ---------------- */
  // Illustrates the pipeline while the data service wakes. Nothing drawn
  // here is data; the captions beside it say what each step represents.

  drawConcept(now) {
    const C = this.concept
    if (!C) return
    const fadeOut = C.out ? 1 - c01((now - C.out) / 500) : 1
    if (fadeOut <= 0) {
      this.concept = null
      return
    }
    const g = this.ctx
    const A = this.view.w / this.view.h
    const [cx, cy] = this.conceptAt || [0.2, 0.02]
    const node = this.project(A * cx, cy, 0)
    const loc = (dx, dy) => this.project(A * cx + dx, cy + dy, 0)
    const since = now - C.t0
    const step = C.step
    const alpha = fadeOut * c01((now - C.born) / 600)
    const unit = this.view.h * this.cam.zoom * node.s
    g.save()

    // the signal particle: drifts in from the left, then orbits the node
    const tt = (now - C.born) / 1000
    let px
    let py
    if (step <= 1) {
      const k = step === 1 ? easeOut(since / 1800) : 0
      const d = loc(-0.34 + 0.06 * Math.sin(tt * 0.5), -0.12 + 0.02 * Math.sin(tt * 0.8))
      const e = loc(-0.16, -0.08)
      px = d.x + (e.x - d.x) * k
      py = d.y + (e.y - d.y) * k
    } else {
      const from = loc(-0.16, -0.08)
      const a = tt * 0.9
      const o = loc(Math.cos(a) * 0.055, Math.sin(a) * 0.045)
      const k = step === 2 ? easeInOut(since / 1400) : 1
      px = from.x + (o.x - from.x) * k
      py = from.y + (o.y - from.y) * k
    }
    const lit = step >= 1 ? c01((step === 1 ? since : 1000) / 600) : 0
    const toned = step >= 3 ? c01((step === 3 ? since : 1000) / 700) : 0
    g.globalCompositeOperation = 'lighter'
    const gl = this.sprites.glowBlue
    const gs = (6 + 10 * lit) / gl.half
    g.globalAlpha = alpha * (0.2 + 0.8 * lit) * (1 - toned * 0.5)
    g.drawImage(gl.img, px - gl.half * gs * 2, py - gl.half * gs * 2, gl.half * 4 * gs, gl.half * 4 * gs)
    const dot = toned > 0.5 ? this.sprites.pos[0] : lit > 0.3 ? this.sprites.blue[0] : this.sprites.noise[0]
    const ds = (1.2 + 2.6 * lit) / this.sprites.BASE_R
    g.globalAlpha = alpha * (0.5 + 0.5 * lit)
    g.drawImage(dot.img, px - dot.half * ds, py - dot.half * ds, dot.half * 2 * ds, dot.half * 2 * ds)
    g.globalCompositeOperation = 'source-over'

    // the company node and the link to it
    if (step >= 2) {
      const k = step === 2 ? easeOut(since / 900) : 1
      g.globalAlpha = alpha * k
      g.strokeStyle = 'rgba(244,241,234,0.35)'
      g.lineWidth = 1
      g.beginPath()
      g.arc(node.x, node.y, 0.075 * unit * (0.7 + 0.3 * k), 0, TAU)
      g.stroke()
      g.fillStyle = 'rgba(244,241,234,0.95)'
      g.beginPath()
      g.arc(node.x, node.y, 2, 0, TAU)
      g.fill()
      if (step === 2) {
        g.strokeStyle = `rgba(120,156,255,${(0.7 * (1 - k)).toFixed(3)})`
        g.setLineDash([3, 4])
        g.beginPath()
        g.moveTo(px, py)
        g.lineTo(node.x, node.y)
        g.stroke()
        g.setLineDash([])
      }
    }
    // tone: one expanding ring
    if (step === 3) {
      const k = c01(since / 1400)
      g.globalAlpha = alpha * (1 - k) * 0.8
      g.strokeStyle = 'rgba(132,206,170,1)'
      g.beginPath()
      g.arc(node.x, node.y, (0.08 + 0.1 * easeOut(k)) * unit, 0, TAU)
      g.stroke()
    }
    // market: a line drawn beside the node, with the event marked
    if (step >= 4) {
      const k = easeInOut(since / 1600)
      const pts = []
      const R = rng(7)
      let v = 0
      for (let i = 0; i < 28; i++) {
        v += (R() - 0.5) * 0.024 + (i > 9 ? 0.004 : 0)
        pts.push(loc(0.13 + i * 0.012, 0.02 - v))
      }
      const ev = pts[9]
      g.globalAlpha = alpha
      g.strokeStyle = 'rgba(120,156,255,0.8)'
      g.setLineDash([3, 4])
      g.beginPath()
      g.moveTo(ev.x, ev.y - 0.09 * unit)
      g.lineTo(ev.x, ev.y + 0.09 * unit)
      g.stroke()
      g.setLineDash([])
      g.strokeStyle = 'rgba(244,241,234,0.85)'
      g.lineWidth = 1.4
      g.beginPath()
      const upto = Math.max(1, Math.floor(k * (pts.length - 1)))
      pts.slice(0, upto + 1).forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)))
      g.stroke()
    }
    g.restore()
  }

  /* ---------------- interaction ---------------- */

  hitTest(x, y) {
    let best = null
    let bd = this.compact ? 22 : 14
    for (const p of this.parts) {
      if (p.place !== '2d' || !p.cur || p.cur.alpha < 0.4) continue
      const d = Math.hypot(p.cur.x - x, p.cur.y - y)
      if (d < bd) {
        bd = d
        best = { kind: 'mention', key: p.id, ticker: p.ticker, x: p.cur.x, y: p.cur.y }
      }
    }
    if (best || this.focus || this.targets.size || this.phase !== 'field') return best
    let score = 1.15
    for (const n of this.nodes.values()) {
      if (n.alpha < 0.5) continue
      const d = Math.hypot(n.sx - x, n.sy - y)
      const k = d / (n.rs + 16)
      if (k < score) {
        score = k
        best = { kind: 'node', key: n.ticker, ticker: n.ticker, x: n.sx, y: n.sy, r: n.rs }
      }
    }
    return best
  }

  setHover(h) {
    const same = (a, b) => (a && b ? a.kind === b.kind && a.key === b.key : a === b)
    if (same(h, this.hover)) {
      if (h) {
        this.hover.x = h.x
        this.hover.y = h.y
      }
      return
    }
    this.hover = h
    this.canvas.style.cursor = h ? 'pointer' : ''
    this.onHover(h)
  }

  nodeScreen(ticker) {
    const n = this.nodes.get(ticker)
    return n ? { x: n.sx, y: n.sy, r: n.rs } : null
  }
}
