<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import OpeningLandscape from './OpeningLandscape.vue'
import { rememberOpening } from '../utils/opening-sequence.mjs'

const emit = defineEmits(['progress'])
const base = import.meta.env.BASE_URL
const chapter = ref(null), scene = ref(null), wordmark = ref(null)
const paused = ref(false), reduced = ref(false), logoFailed = ref(false), hidden = ref(false)
const arrived = ref(false)
let frame = 0, preference, remembered = false, focusOnArrival = false
const clamp = n => Math.max(0, Math.min(1, n))
const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p) }

function distance() { return Math.max(1, chapter.value.offsetHeight - scene.value.offsetHeight) }
function paint() {
  frame = 0
  if (!chapter.value) return
  const travelled = -chapter.value.getBoundingClientRect().top
  const p = clamp(travelled / distance())
  const atHome = p >= 1
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
function skip() { focusOnArrival = true; window.scrollBy({ top: distance() + chapter.value.getBoundingClientRect().top, behavior: 'instant' }); schedule() }
function move(event) {
  if (arrived.value || reduced.value || paused.value || event.pointerType !== 'mouse') return
  scene.value?.style.setProperty('--pan-x', (event.clientX / innerWidth - .5) * 100 + 'px')
  scene.value?.style.setProperty('--pan-y', (event.clientY / innerHeight - .5) * 45 + 'px')
  scene.value?.style.setProperty('--bearing', Math.atan2(event.clientY - innerHeight / 2, event.clientX - innerWidth / 2) * 180 / Math.PI + 90 + 'deg')
}
function updateMotion() { reduced.value = preference.matches; schedule() }
function visibility() { hidden.value = document.hidden }
function keyboard(event) { if (!arrived.value && event.key === 'Escape' && !document.querySelector('dialog[open]')) skip() }
onMounted(() => {
  preference = matchMedia('(prefers-reduced-motion: reduce)')
  reduced.value = preference.matches
  preference.addEventListener('change', updateMotion)
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  window.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('visibilitychange', visibility)
  document.addEventListener('keydown', keyboard)
  // Router scroll restoration owns the initial position; no wheel/touch interception.
  paint()
  if (!arrived.value) chapter.value.focus({ preventScroll: true })
})
onUnmounted(() => {
  cancelAnimationFrame(frame)
  document.documentElement.classList.remove('is-opening-story')
  document.documentElement.style.removeProperty('--intro-offset')
  document.documentElement.style.removeProperty('--intro-navigation')
  preference?.removeEventListener('change', updateMotion)
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('resize', schedule)
  window.removeEventListener('pointermove', move)
  document.removeEventListener('visibilitychange', visibility)
  document.removeEventListener('keydown', keyboard)
})
</script>

<template>
  <section ref="chapter" class="opening-chapter" :class="{ 'has-arrived': arrived }" :inert="arrived" :aria-hidden="arrived ? true : undefined" aria-label="序章，向下滚动展开旅途，向上滚动返回" tabindex="-1">
    <div ref="scene" class="opening-sequence" :class="{ 'is-still': paused || reduced || hidden || arrived }">
      <div class="opening-paper"><OpeningLandscape :class="{ 'world-still': paused || reduced || hidden || arrived }" /></div>
      <div class="intro-tools intro-copy"><button type="button" :disabled="reduced" :aria-pressed="paused" @click="paused = !paused">{{ reduced ? '静态画卷' : paused ? '继续画卷' : '暂停画卷' }}</button><button type="button" @click="skip">跳过序章 ↗</button></div>
      <p class="intro-preface intro-copy">序章 · 在故事与世界之间</p>
      <div class="intro-margin intro-copy" aria-hidden="true"><span>IMAGINE</span><i></i><span>WANDER</span><i></i><span>REMEMBER</span></div>
      <h1 ref="wordmark" class="intro-wordmark"><img v-if="!logoFailed" :src="base + 'img/story-pilgrim-wordmark-v1.png'" alt="Story Pilgrim" fetchpriority="high" @error="logoFailed = true" /><span v-else>Story Pilgrim</span></h1>
      <div class="intro-invitation intro-copy"><p class="intro-chinese">我的圣地巡礼</p><p class="intro-description">纸上的远方，正慢慢成为脚下的路。</p></div>
      <div class="intro-scroll intro-copy" aria-hidden="true"><svg viewBox="0 0 180 100" fill="none"><path class="scroll-path" pathLength="1" d="M90 3c-52 14 44 28 4 46-34 15-25 28-4 40m-7-8 7 8 7-8" /></svg><p>向下滚动，让故事慢慢展开</p><small>SCROLL TO WANDER</small></div>
      <div class="intro-folio intro-copy" aria-hidden="true"><span>一</span><i>THE ATLAS<br>OF STORIES</i></div>
      <footer class="opening-folio-footer intro-copy"><span>VOL. I — 世界是故事的回响</span><span>序 / 001</span></footer>
    </div>
  </section>
</template>
<style src="./opening-sequence.css"></style>
