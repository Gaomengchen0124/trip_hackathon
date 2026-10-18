<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import OpeningLandscape from './OpeningLandscape.vue'
import { rememberOpening } from '../utils/opening-sequence.mjs'

const emit = defineEmits(['progress'])
const base = import.meta.env.BASE_URL
const chapter = ref(null), scene = ref(null), wordmark = ref(null)
const paused = ref(false), reduced = ref(false), logoFailed = ref(false), hidden = ref(false)
const arrived = ref(false), dragging = ref(false)
let frame = 0, preference, remembered = false, focusOnArrival = false, landing = false
let pointer = null, touch = null, suppressClick = false
const DRAG_DISTANCE = 18
const clamp = n => Math.max(0, Math.min(1, n))
const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p) }

function distance() { return Math.max(1, chapter.value.offsetHeight - scene.value.offsetHeight) }
function paint() {
  frame = 0
  if (!chapter.value) return
  const travelled = -chapter.value.getBoundingClientRect().top
  const p = clamp(travelled / distance())
  const atHome = p >= 1
  if (atHome) landing = false
  if (atHome !== arrived.value) arrived.value = atHome
  document.documentElement.classList.toggle('is-opening-story', !atHome)
  emit('progress', p)
  scene.value.style.setProperty('--unfold', p)
  scene.value.style.setProperty('--veil', 1 - smooth((p - .2) / .8))
  scene.value.style.setProperty('--copy', 1 - smooth(p / .55))
  document.documentElement.style.setProperty('--intro-offset', Math.max(0, distance() - travelled) + 'px')
  document.documentElement.style.setProperty('--intro-navigation', smooth((p - .55) / .45))
  const target = document.querySelector('.travel-masthead .english')?.getBoundingClientRect()
  if (target && wordmark.value) {
    const width = Math.min(innerWidth * .82, 1180), height = width / 6.88
    const from = { x: (document.documentElement.clientWidth - width) / 2, y: scene.value.offsetHeight * .38 - height / 2, width, height }
    const blend = reduced.value ? 0 : smooth(p)
    const lerp = (a, b) => a + (b - a) * blend
    Object.assign(wordmark.value.style, {
      left: lerp(from.x, target.left) + 'px', top: lerp(from.y, target.top - Math.max(0, distance() - travelled)) + 'px',
      width: lerp(from.width, target.width) + 'px', height: lerp(from.height, target.height) + 'px',
      opacity: atHome ? 0 : reduced.value ? 1 - smooth(p) : 1,
    })
  }
  if (atHome && !remembered) {
    remembered = true
    try { rememberOpening(sessionStorage) } catch { /* Storage is optional. */ }
  }
  if (atHome && focusOnArrival) {
    focusOnArrival = false
    requestAnimationFrame(() => {
      if (chapter.value && arrived.value && !document.querySelector('dialog[open]')) document.querySelector('.travel-masthead .english')?.focus({ preventScroll: true })
    })
  }
}
function schedule() { if (!frame) frame = requestAnimationFrame(paint) }
function advance(focus = false, instant = false) {
  if (!chapter.value || arrived.value || landing) return
  focusOnArrival = focus
  landing = true
  const top = window.scrollY + chapter.value.getBoundingClientRect().top + distance()
  window.scrollTo({ top, behavior: instant || reduced.value ? 'instant' : 'smooth' })
  schedule()
}
function stopLanding() {
  if (!landing) return
  landing = false
  focusOnArrival = false
  window.scrollTo({ top: window.scrollY, behavior: 'instant' })
}
function scrollEnded() { landing = false }
function skip() { stopLanding(); advance(true, true) }
const isControl = target => target?.closest?.('button:not(.intro-scroll), a, input, select, textarea, [role="button"]')
function clickScene(event) {
  if (isControl(event.target)) return
  if (suppressClick) { suppressClick = false; return }
  advance(true)
}
function pointerDown(event) {
  if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0 || arrived.value || isControl(event.target)) return
  stopLanding()
  suppressClick = false
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
  dragging.value = true
  scene.value.setPointerCapture(event.pointerId)
}
function pointerMove(event) {
  if (!pointer || event.pointerId !== pointer.id) return
  const dy = pointer.y - event.clientY, dx = pointer.x - event.clientX
  if (Math.hypot(dx, dy) > 8) suppressClick = true
  if (dy >= DRAG_DISTANCE && dy >= Math.abs(dx)) advance()
}
function pointerEnd(event) {
  if (!pointer || event.pointerId !== pointer.id) return
  pointer = null
  dragging.value = false
  if (scene.value?.hasPointerCapture(event.pointerId)) scene.value.releasePointerCapture(event.pointerId)
}
function touchStart(event) {
  touch = null
  if (event.touches.length !== 1 || arrived.value || isControl(event.target)) return
  stopLanding()
  suppressClick = false
  touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, dx: 0, dy: 0 }
}
function touchMove(event) {
  if (!touch) return
  if (event.touches.length !== 1) { touch = null; return }
  touch.dx = touch.x - event.touches[0].clientX
  touch.dy = touch.y - event.touches[0].clientY
  if (Math.hypot(touch.dx, touch.dy) > 8) suppressClick = true
}
function touchEnd() {
  const gesture = touch
  touch = null
  // Wait until release so native touch panning does not cancel the smooth landing.
  if (gesture && gesture.dy >= DRAG_DISTANCE && gesture.dy >= Math.abs(gesture.dx)) advance()
}
function wheel(event) {
  if (arrived.value || event.ctrlKey || event.deltaY === 0) return
  if (event.deltaY < 0) { stopLanding(); return }
  event.preventDefault()
  advance()
}
function move(event) {
  if (arrived.value || reduced.value || paused.value || event.pointerType !== 'mouse') return
  scene.value?.style.setProperty('--pan-x', (event.clientX / innerWidth - .5) * 100 + 'px')
  scene.value?.style.setProperty('--pan-y', (event.clientY / innerHeight - .5) * 45 + 'px')
  scene.value?.style.setProperty('--bearing', Math.atan2(event.clientY - innerHeight / 2, event.clientX - innerWidth / 2) * 180 / Math.PI + 90 + 'deg')
}
function updateMotion() { reduced.value = preference.matches; schedule() }
function visibility() { hidden.value = document.hidden }
function keyboard(event) {
  if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) stopLanding()
  if (!arrived.value && event.key === 'Escape' && !document.querySelector('dialog[open]')) skip()
}
onMounted(() => {
  preference = matchMedia('(prefers-reduced-motion: reduce)')
  reduced.value = preference.matches
  preference.addEventListener('change', updateMotion)
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('scrollend', scrollEnded)
  window.addEventListener('resize', schedule)
  window.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('visibilitychange', visibility)
  document.addEventListener('keydown', keyboard)
  // Router owns initial/history positions; gestures only complete an explicit arrival.
  paint()
  if (!arrived.value) chapter.value.focus({ preventScroll: true })
})
onUnmounted(() => {
  stopLanding()
  cancelAnimationFrame(frame)
  document.documentElement.classList.remove('is-opening-story')
  document.documentElement.style.removeProperty('--intro-offset')
  document.documentElement.style.removeProperty('--intro-navigation')
  preference?.removeEventListener('change', updateMotion)
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('scrollend', scrollEnded)
  window.removeEventListener('resize', schedule)
  window.removeEventListener('pointermove', move)
  document.removeEventListener('visibilitychange', visibility)
  document.removeEventListener('keydown', keyboard)
})
</script>

<template>
  <section ref="chapter" class="opening-chapter" :class="{ 'has-arrived': arrived }" :inert="arrived" :aria-hidden="arrived ? true : undefined" aria-label="序章，轻拖、点击或向下滚动前往首页，向上滚动返回" tabindex="-1">
    <div ref="scene" class="opening-sequence" :class="{ 'is-still': paused || reduced || hidden || arrived, 'is-dragging': dragging }" @click="clickScene" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd" @touchstart.passive="touchStart" @touchmove.passive="touchMove" @touchend.passive="touchEnd" @touchcancel.passive="touch = null" @wheel="wheel">
      <div class="opening-paper"><OpeningLandscape :class="{ 'world-still': paused || reduced || hidden || arrived }" /></div>
      <div class="intro-tools intro-copy"><button type="button" :disabled="reduced" :aria-pressed="paused" @click="paused = !paused">{{ reduced ? '静态画卷' : paused ? '继续画卷' : '暂停画卷' }}</button><button type="button" @click="skip">跳过序章 ↗</button></div>
      <p class="intro-preface intro-copy">序章 · 在故事与世界之间</p>
      <div class="intro-margin intro-copy" aria-hidden="true"><span>IMAGINE</span><i></i><span>WANDER</span><i></i><span>REMEMBER</span></div>
      <h1 ref="wordmark" class="intro-wordmark"><img v-if="!logoFailed" :src="base + 'img/story-pilgrim-wordmark-v1.png'" alt="Story Pilgrim" fetchpriority="high" :draggable="false" @error="logoFailed = true" /><span v-else>Story Pilgrim</span></h1>
      <div class="intro-invitation intro-copy"><p class="intro-chinese">我的圣地巡礼</p><p class="intro-description">纸上的远方，正慢慢成为脚下的路。</p></div>
      <button type="button" class="intro-scroll intro-copy" aria-label="展开旅途，前往首页" @click.stop="advance(true)"><svg viewBox="0 0 180 100" fill="none" aria-hidden="true"><path class="scroll-path" pathLength="1" d="M90 3c-52 14 44 28 4 46-34 15-25 28-4 40m-7-8 7 8 7-8" /></svg><span class="intro-scroll-label">轻轻上滑，或点击展开旅途</span><small>DRAG OR CLICK TO WANDER</small></button>
      <div class="intro-folio intro-copy" aria-hidden="true"><span>一</span><i>THE ATLAS<br>OF STORIES</i></div>
      <footer class="opening-folio-footer intro-copy"><span>VOL. I — 世界是故事的回响</span><span>序 / 001</span></footer>
    </div>
  </section>
</template>
<style src="./opening-sequence.css"></style>
