import { nextTick } from 'vue'

// Keep link/history navigation intact; turn the paper and carry a clicked photo across it.
export function installPhotoTransitions(router) {
  if (typeof document === 'undefined') return () => {}
  let candidate = null
  let active = null
  let homeOrigin = null
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const visible = photo => {
    if (!photo?.isConnected) return false
    const box = photo.getBoundingClientRect()
    return box.width > 0 && box.height > 0 && box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight
  }
  function releaseHomeTrack() {
    const origin = homeOrigin
    if (!origin?.track) return
    if (origin.playState) origin.track.style.setProperty('animation-play-state', origin.playState, origin.priority)
    else origin.track.style.removeProperty('animation-play-state')
    origin.track = null
  }
  function rememberHomePhoto(photo, detailPath) {
    releaseHomeTrack()
    const track = photo.closest('.wall-track')
    homeOrigin = {
      photo, detailPath, image: photo.querySelector('img')?.currentSrc,
      track, phase: track?.getAnimations()[0]?.currentTime,
      playState: track?.style.getPropertyValue('animation-play-state'),
      priority: track?.style.getPropertyPriority('animation-play-state')
    }
    // Preserve the clicked row while its cached home is out of view.
    if (track) track.style.animationPlayState = 'paused'
  }
  function homePhoto() {
    if (!homeOrigin) return null
    // A CSS animation can restart when KeepAlive reattaches its DOM.
    if (homeOrigin.track?.isConnected && homeOrigin.phase != null) {
      for (const animation of homeOrigin.track.getAnimations()) animation.currentTime = homeOrigin.phase
    }
    if (visible(homeOrigin.photo)) return homeOrigin.photo
    // Resize or a duplicated photo-wall tile can change which copy is visible.
    return [...document.querySelectorAll('.home-page .photo-frame')].find(photo =>
      photo.querySelector('img')?.currentSrc === homeOrigin.image && visible(photo)) || null
  }
  function capture(event) {
    candidate = null
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const card = event.target.closest?.('.wall-tile, .route-card, .recommend-card')
    if (!card || (card.matches('.recommend-card') && !event.target.closest('.route-link'))) return
    const photo = card.querySelector('.photo-frame')
    if (photo?.querySelector('img')) candidate = { photo, at: Date.now() }
  }
  document.addEventListener('click', capture, true)

  function waitForHero() {
    const find = () => document.querySelector('.route-intro .hero-photo')
    if (find()) return Promise.resolve(find())
    return new Promise(resolve => {
      const finish = () => { observer.disconnect(); clearTimeout(timer); resolve(find()) }
      const observer = new MutationObserver(() => { if (find()) finish() })
      const timer = setTimeout(finish, 650)
      observer.observe(document.getElementById('app'), { childList: true, subtree: true })
    })
  }
  // Router scroll restoration finishes after its nextTick; sample the destination after that.
  const settleLayout = () => new Promise(resolve => {
    const timer = setTimeout(resolve, 100)
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve() }))
  })
  const removeGuard = router.beforeResolve((to, from) => {
    const clicked = candidate
    candidate = null
    if (active) {
      active.transition?.skipTransition()
      active.complete(false)
      return
    }
    const returningHome = to.name === 'home' && from.name === 'route-intro' && homeOrigin?.detailPath === from.fullPath
    const openingDetail = to.name === 'route-intro' && ['home', 'column', 'recommend'].includes(from.name) && clicked?.photo.isConnected && Date.now() - clicked.at < 1000
    if (to.name === 'route-intro' && ['home', 'column', 'recommend'].includes(from.name) && (!openingDetail || from.name !== 'home')) {
      releaseHomeTrack()
      homeOrigin = null
    }
    const publicTurn = from.name && !to.meta.admin && !from.meta.admin && to.path !== from.path
    if (!publicTurn || !document.startViewTransition || reduced()) return
    const source = returningHome ? document.querySelector('.route-intro .hero-photo') : openingDetail ? clicked.photo : null
    const carriesPhoto = !!source?.querySelector('img')
    if (carriesPhoto && openingDetail && from.name === 'home') rememberHomePhoto(source, to.fullPath)

    return new Promise(allowNavigation => {
      const current = { source, target: null, complete: null, transition: null }
      active = current
      if (carriesPhoto) source.style.viewTransitionName = 'route-photo'
      document.documentElement.dataset.atlasTurn = to.name === 'home' ? 'back' : 'forward'
      const committed = new Promise(resolve => { current.complete = resolve })
      const releaseTimer = setTimeout(() => { allowNavigation(); current.complete(false); current.transition?.skipTransition() }, 1600)
      const cleanup = () => {
        clearTimeout(releaseTimer)
        source?.style.removeProperty('view-transition-name')
        current.target?.style.removeProperty('view-transition-name')
        if (active === current) { active = null; delete document.documentElement.dataset.atlasTurn }
        if (router.currentRoute.value.name === 'home' || router.currentRoute.value.fullPath !== homeOrigin?.detailPath) releaseHomeTrack()
      }
      try {
        current.transition = document.startViewTransition(async () => {
          allowNavigation()
          if (!await committed) return
          await nextTick()
          if (!carriesPhoto) { await settleLayout(); return }
          if (returningHome) {
            await settleLayout()
            current.target = homePhoto()
          } else current.target = await waitForHero()
          if (!current.target) return
          const img = current.target.querySelector('img')
          if (img?.decode) await Promise.race([img.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 180))])
          current.target.style.viewTransitionName = 'route-photo'
        })
        current.transition.ready.catch(() => {})
        current.transition.finished.catch(() => {}).finally(cleanup)
      } catch {
        cleanup()
        allowNavigation()
      }
    })
  })
  const removeAfter = router.afterEach((to, _from, failure) => {
    active?.complete(!failure)
    if (!active && to.name === 'home' && !failure) releaseHomeTrack()
  })
  const removeError = router.onError(() => { active?.complete(false); active?.transition?.skipTransition(); releaseHomeTrack() })
  return () => {
    document.removeEventListener('click', capture, true)
    removeGuard(); removeAfter(); removeError()
    active?.complete(false); active?.transition?.skipTransition()
    releaseHomeTrack()
  }
}
