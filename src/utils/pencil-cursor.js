// A single pencil trail shared by the prologue, every page and native dialogs.
// Native pointer remains visible. The canvas never receives input.
export function installPencilCursor(router) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = document.createElement('canvas')
  canvas.className = 'pencil-cursor'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'pointer-events:none;z-index:10000;contain:strict;'
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  let points = [], frame = 0, lastInput = 0, owner = null
  const enabled = () => fine.matches && !reduced.matches && !document.hidden
  function clear() {
    cancelAnimationFrame(frame); frame = 0; points = []; owner = null
    ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.remove()
  }
  function attach(target) {
    const next = target.closest('dialog[open]') || document.body
    if (owner !== next) { points = []; owner = next; owner.append(canvas) }
    const local = owner !== document.body
    const width = local ? owner.clientWidth : innerWidth, height = local ? owner.clientHeight : innerHeight
    Object.assign(canvas.style, {
      position: local ? 'absolute' : 'fixed', left: (local ? owner.scrollLeft : 0) + 'px',
      top: (local ? owner.scrollTop : 0) + 'px', width: width + 'px', height: height + 'px',
    })
    const ratio = Math.min(devicePixelRatio || 1, 1.5)
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    }
  }
  function paint(now) {
    frame = 0
    if (!enabled() || !canvas.isConnected || !points.length) { clear(); return }
    const alpha = Math.max(0, Math.min(1, (650 - (now - lastInput)) / 220))
    if (!alpha) { clear(); return }
    const box = canvas.getBoundingClientRect()
    if (!box.width || !box.height) { clear(); return }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height)
    const sx = canvas.width / box.width, sy = canvas.height / box.height
    ctx.setTransform(sx, 0, 0, sy, -box.left * sx, -box.top * sy)
    ctx.strokeStyle = '#a88d58'; ctx.lineWidth = .9; ctx.globalAlpha = alpha * .65
    ctx.setLineDash([2, 5]); ctx.beginPath()
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke()
    const tip = points[points.length - 1]
    ctx.globalAlpha = alpha * .75; ctx.setLineDash([19, 5]); ctx.beginPath()
    ctx.arc(tip.x, tip.y, 15, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([]); ctx.beginPath()
    for (const [x, y] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      ctx.moveTo(tip.x + x * 19, tip.y + y * 19); ctx.lineTo(tip.x + x * 23, tip.y + y * 23)
    }
    ctx.stroke()
    frame = requestAnimationFrame(paint)
  }
  function move(event) {
    if (!enabled() || event.pointerType !== 'mouse' || !(event.target instanceof Element)) return
    if (event.target.closest('input, textarea, select, [contenteditable], [inert], .leaflet-container')) { clear(); return }
    attach(event.target)
    const point = { x: event.clientX, y: event.clientY }
    const previous = points[points.length - 1]
    const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : Infinity
    if (distance > 140) points = []
    if (distance >= 7) points.push(point)
    points = points.slice(-18); lastInput = performance.now()
    if (!frame) frame = requestAnimationFrame(paint)
  }
  const leave = event => { if (!event.relatedTarget) clear() }
  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerout', leave)
  document.addEventListener('pointerdown', clear, { capture: true, passive: true })
  document.addEventListener('scroll', clear, { capture: true, passive: true })
  document.addEventListener('visibilitychange', clear)
  window.addEventListener('resize', clear); window.addEventListener('blur', clear)
  fine.addEventListener('change', clear); reduced.addEventListener('change', clear)
  const unwatch = router.beforeEach(clear)
  return () => {
    clear(); unwatch()
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerout', leave)
    document.removeEventListener('pointerdown', clear, true); document.removeEventListener('scroll', clear, true)
    document.removeEventListener('visibilitychange', clear)
    window.removeEventListener('resize', clear); window.removeEventListener('blur', clear)
    fine.removeEventListener('change', clear); reduced.removeEventListener('change', clear)
  }
}
