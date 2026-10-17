// Decorative mouse feedback, delegated once instead of attaching handlers to every card.
export function installCursorBubbles(router) {
  if (typeof document === 'undefined') return () => {}
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)')
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = document.createElement('canvas')
  canvas.className = 'cursor-bubbles'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;pointer-events:none;z-index:1500;contain:strict;'
  const context = canvas.getContext('2d')
  if (!context) return () => {}
  let particles = []
  let frame = 0, lastInput = 0, lastEmission = 0
  let activeControl = null, trailAnchor = null, goal = null
  let width = 0, height = 0, pixelRatio = 1
  let bubbleColor = '168,141,88'
  const enabled = () => finePointer.matches && !reducedMotion.matches && !document.hidden
  const clamp = value => Math.max(0, Math.min(1, value))

  function clear() {
    cancelAnimationFrame(frame)
    frame = 0
    particles = []
    activeControl = trailAnchor = goal = null
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    canvas.remove()
  }
  function attach(control) {
    // A dialog is in the top layer: its decoration must be inside that dialog too.
    const owner = control.closest('dialog[open]') || document.body
    if (canvas.parentNode !== owner) {
      particles = []
      goal = null
      owner.append(canvas)
    }
    const local = owner !== document.body
    const surfaceWidth = local ? owner.clientWidth : innerWidth
    const surfaceHeight = local ? owner.clientHeight : innerHeight
    canvas.style.position = local ? 'absolute' : 'fixed'
    canvas.style.inset = 'auto'
    canvas.style.left = `${local ? owner.scrollLeft : 0}px`
    canvas.style.top = `${local ? owner.scrollTop : 0}px`
    canvas.style.width = `${surfaceWidth}px`
    canvas.style.height = `${surfaceHeight}px`
    const ratio = Math.min(devicePixelRatio || 1, 1.5)
    if (width !== surfaceWidth || height !== surfaceHeight || pixelRatio !== ratio) {
      width = surfaceWidth; height = surfaceHeight; pixelRatio = ratio
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
    }
  }
  function bubble(x, y, radius, alpha) {
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.lineWidth = 1
    context.strokeStyle = `rgba(${bubbleColor},${alpha})`
    context.stroke()
  }
  function paint(now) {
    frame = 0
    if (!enabled() || !canvas.isConnected) { clear(); return }
    bubbleColor = activeControl?.closest('.yoyo-buddy') ? '65,150,220' : getComputedStyle(document.documentElement).getPropertyValue('--brand-rgb').trim().replace(/\s+/g, ',')
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) { clear(); return }
    // Keep viewport coordinates correct during a dialog's small scale/translate entrance.
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height
    context.setTransform(sx, 0, 0, sy, -rect.left * sx, -rect.top * sy)
    particles = particles.filter(p => now - p.born < p.life)
    for (const p of particles) {
      const progress = (now - p.born) / p.life
      bubble(p.x, p.y, p.radius * (1 - progress * .25), p.alpha * (1 - progress) ** 2)
    }
    const headAlpha = goal ? clamp(1 - (now - lastInput - 160) / 180) : 0
    // The native cursor's hotspot stays at the ring's exact center, with no lag.
    if (goal && headAlpha > 0) bubble(goal.x, goal.y, 9, headAlpha * .48)
    if (particles.length || headAlpha > 0) frame = requestAnimationFrame(paint)
    else clear()
  }
  function move(event) {
    if (!enabled() || event.pointerType !== 'mouse' || !(event.target instanceof Element)) return
    const control = event.target.closest('button, a[href], [role="button"], summary')
    if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.closest('[inert]') || event.target.closest('input, textarea, select, [contenteditable="true"]')) {
      activeControl = trailAnchor = goal = null
      return
    }
    attach(control)
    const now = performance.now(), x = event.clientX, y = event.clientY
    const from = activeControl === control ? trailAnchor : null
    const distance = from ? Math.hypot(x - from.x, y - from.y) : 0
    if (!from) {
      particles = []
      lastEmission = now
    } else if (distance >= 8 || now - lastEmission >= 35) {
      const count = Math.min(3, Math.max(1, Math.floor(distance / 10)))
      for (let i = 1; i <= count; i++) {
        const blend = i / (count + 1)
        particles.push({
          x: from.x + (x - from.x) * blend,
          y: from.y + (y - from.y) * blend,
          born: now, life: 460 + Math.random() * 220,
          radius: 2.5 + Math.random() * 3.5, alpha: .2 + Math.random() * .22
        })
      }
      particles = particles.slice(-28)
      lastEmission = now
    }
    trailAnchor = { x, y }
    goal = { x, y }
    activeControl = control
    lastInput = now
    if (!frame) frame = requestAnimationFrame(paint)
  }
  const leave = event => { if (!event.relatedTarget) clear() }
  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerdown', clear, { passive: true, capture: true })
  document.addEventListener('pointerout', leave, { passive: true })
  document.addEventListener('scroll', clear, { passive: true, capture: true })
  document.addEventListener('visibilitychange', clear)
  window.addEventListener('resize', clear)
  window.addEventListener('blur', clear)
  finePointer.addEventListener('change', clear)
  reducedMotion.addEventListener('change', clear)
  const removeGuard = router.beforeEach(clear)
  return () => {
    clear()
    removeGuard()
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerdown', clear, true)
    document.removeEventListener('pointerout', leave)
    document.removeEventListener('scroll', clear, true)
    document.removeEventListener('visibilitychange', clear)
    window.removeEventListener('resize', clear)
    window.removeEventListener('blur', clear)
    finePointer.removeEventListener('change', clear)
    reducedMotion.removeEventListener('change', clear)
    canvas.width = canvas.height = 0
  }
}
