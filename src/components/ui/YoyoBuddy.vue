<script setup>
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import DolphinGuide from './DolphinGuide.vue'

const props = defineProps({
  state: { type: String, default: 'welcome' },
  size: { type: Number, default: 64 },
  message: { type: String, default: '嗨，我是 YOYO，一起去故事里旅行吧。' },
  reactTo: { type: [Number, String], default: undefined },
  disabled: Boolean,
  centered: Boolean,
  appear: Boolean,
  label: { type: String, default: '和 YOYO 打个招呼' },
})
const messageId = useId()
const playing = ref(false)
const showMessage = ref(false)
const sequence = ref(0)
let motionTimer, messageTimer

function react(force = false) {
  if (props.disabled || (playing.value && !force)) return
  clearTimeout(motionTimer)
  playing.value = true
  sequence.value++
  motionTimer = setTimeout(() => { playing.value = false }, 760)
}
function greet() {
  if (props.disabled) return
  react(true)
  clearTimeout(messageTimer)
  showMessage.value = true
  messageTimer = setTimeout(hideMessage, 3200)
}
function hideMessage() {
  clearTimeout(messageTimer)
  showMessage.value = false
}
function escapeMessage(event) {
  if (!showMessage.value) return
  event.preventDefault()
  event.stopPropagation()
  hideMessage()
}
function hover() {
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) react()
}
watch(() => props.reactTo, (value, previous) => { if (value !== previous) react(props.appear) })
watch(() => props.disabled, disabled => { if (disabled) hideMessage() })
onMounted(() => { if (props.appear) react(true) })
onBeforeUnmount(() => { clearTimeout(motionTimer); clearTimeout(messageTimer) })
</script>

<template>
  <span class="yoyo-buddy" :class="{ 'is-playing': playing, 'has-message': showMessage, centered }" :style="{ '--buddy-size': `${size}px` }">
    <button
      class="yoyo-touch"
      type="button"
      :disabled="disabled"
      :aria-label="label"
      :aria-describedby="showMessage ? messageId : undefined"
      @click.stop="greet"
      @pointerenter="hover"
      @focus="react()"
      @blur="hideMessage"
      @keydown.esc="escapeMessage"
    >
      <span :key="sequence" class="buddy-motion"><DolphinGuide :state="state" :size="size" /></span>
      <svg :key="`pencil-${sequence}`" class="yoyo-pencil" viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M10 68c8-15 17 17 28 11s37-8 50-26"/><path d="m79 23 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/></svg>
    </button>
    <span :id="messageId" class="yoyo-speech" role="status">{{ showMessage ? message : '' }}</span>
  </span>
</template>

<style scoped>
.yoyo-buddy { position: relative; display: inline-flex; flex: none; vertical-align: middle; --buddy-size: 64px; }
.yoyo-buddy.has-message { z-index: 25; }
.yoyo-buddy .yoyo-touch { display: grid; place-items: center; width: max(44px, calc(var(--buddy-size) * .75)); height: max(44px, var(--buddy-size)); padding: 0; border: 0; border-radius: 16px; background: transparent; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.yoyo-touch:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; background: var(--brand-light); }
.yoyo-touch:disabled { cursor: default; opacity: 1; }
.buddy-motion { display: inline-flex; transform-origin: 55% 75%; pointer-events: none; }
.buddy-motion :deep(.dolphin-guide:not(.planning)) { animation: none; }
.is-playing .buddy-motion { animation: yoyo-leap 720ms var(--ease-out); }
.yoyo-pencil { position: absolute; inset: -10%; width: 120%; height: 120%; pointer-events: none; stroke: var(--brand); stroke-width: 1; stroke-dasharray: 3 4; opacity: 0; }
.is-playing .yoyo-pencil { animation: yoyo-pencil 750ms ease-out both; }
.yoyo-speech { position: absolute; bottom: calc(100% + 10px); left: 0; width: max-content; max-width: min(240px, calc(100vw - 64px)); padding: 10px 14px; border: 1px solid var(--brand-border); border-radius: 14px 14px 14px 4px; background: #fff; color: var(--brand-strong); box-shadow: 0 6px 24px #205e9c14; font: 12px/1.7 -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; white-space: normal; text-align: left; pointer-events: none; }
.yoyo-speech:empty { display: none; }
.has-message .yoyo-speech { animation: yoyo-say 180ms var(--ease-out); }
.centered .yoyo-speech { left: 50%; translate: -50% 0; border-radius: 14px; }
@keyframes yoyo-leap { 0%, 100% { transform: none; } 25% { transform: translateY(2px) rotate(-8deg); } 52% { transform: translateY(-9px) rotate(7deg); } 76% { transform: translateY(1px) rotate(-3deg); } }
@keyframes yoyo-pencil { 0% { opacity: 0; stroke-dashoffset: 40; } 25% { opacity: .8; } 100% { opacity: 0; stroke-dashoffset: 0; } }
@keyframes yoyo-say { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@media(prefers-reduced-motion:reduce) { .is-playing .buddy-motion, .has-message .yoyo-speech { animation: none; } .yoyo-pencil { display: none; } }
</style>
