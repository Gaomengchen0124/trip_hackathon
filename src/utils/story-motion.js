// Presentation only. One observer for headings/cards, no effects on maps or forms.
export function installStoryMotion() {
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  if (!('IntersectionObserver' in window)) return () => {}
  const waiting = new Set()
  let frame = 0
  function scroll() {
    if (frame || motion.matches) return
    frame = requestAnimationFrame(() => {
      frame = 0
      document.documentElement.style.setProperty('--journal-turn', Math.min(scrollY * .08, 150) + 'deg')
    })
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.remove('story-awaiting')
      entry.target.classList.add('story-arrived')
      waiting.delete(entry.target)
      observer.unobserve(entry.target)
    }
  }, { threshold: .05, rootMargin: '0px 0px -24px' })
  function discover(root) {
    for (const el of root.querySelectorAll('[data-story-reveal]:not(.story-arrived)')) {
      if (waiting.has(el)) continue
      if (motion.matches) { el.classList.add('story-arrived'); continue }
      el.classList.add('story-awaiting'); waiting.add(el); observer.observe(el)
    }
  }
  const changes = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) {
      if (node.matches('[data-story-reveal]')) discover(node.parentElement || document)
      else discover(node)
    }
    for (const el of waiting) if (!el.isConnected) { observer.unobserve(el); waiting.delete(el) }
  })
  function stopMotion() { if (motion.matches) for (const el of waiting) { el.classList.remove('story-awaiting'); el.classList.add('story-arrived'); observer.unobserve(el) }; if (motion.matches) waiting.clear() }
  discover(document)
  changes.observe(document.getElementById('app'), { childList: true, subtree: true })
  motion.addEventListener('change', stopMotion)
  window.addEventListener('scroll', scroll, { passive: true })
  return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', scroll); observer.disconnect(); changes.disconnect(); motion.removeEventListener('change', stopMotion); document.documentElement.style.removeProperty('--journal-turn') }
}
