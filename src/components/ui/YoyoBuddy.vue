<script setup>
import { onBeforeUnmount, ref, useId, watch } from 'vue'
import DolphinGuide from './DolphinGuide.vue'

const props = defineProps({
  state: { type: String, default: 'welcome' },
  size: { type: Number, default: 64 },
  message: { type: String, default: '嗨，我是 YOYO，一起去故事里旅行吧。' },
  reactTo: { type: [Number, String], default: undefined },
  disabled: Boolean,
  centered: Boolean,
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
watch(() => props.reactTo, (value, previous) => { if (value !== previous) react() })
watch(() => props.disabled, disabled => { if (disabled) hideMessage() })
onBeforeUnmount(() => { clearTimeout(motionTimer); clearTimeout(messageTimer) })
</script>

<template>
  <span class="yoyo-buddy" :class="{ 'is-playing': playing, 'has-message': showMessage, centered }" :style="{ '--buddy-size': `${size}px` }">
    <button
      class="yoyo-touch"
      type="button"
      :disabled="disabled"
      aria-label="和 YOYO 打个招呼"
      :aria-describedby="showMessage ? messageId : undefined"
      @click.stop="greet"
      @pointerenter="hover"
      @focus="react()"
      @blur="hideMessage"
      @keydown.esc="escapeMessage"
    >
      <span :key="sequence" class="buddy-motion"><DolphinGuide :state="state" :size="size" /></span>
      <span :key="`bubbles-${sequence}`" class="yoyo-bubbles" aria-hidden="true"><i></i><i></i><i></i></span>
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
.yoyo-bubbles { position: absolute; inset: 0; pointer-events: none; }
.yoyo-bubbles i { position: absolute; top: 45%; left: 50%; width: 6px; height: 6px; border: 1.5px solid #65b8ff; border-radius: 50%; opacity: 0; --drift: -23px; --lift: -29px; }
.yoyo-bubbles i:nth-child(2) { --drift: 25px; --lift: -37px; width: 8px; height: 8px; }
.yoyo-bubbles i:nth-child(3) { --drift: 16px; --lift: -13px; width: 4px; height: 4px; background: #a1d6ff; }
.is-playing .yoyo-bubbles i { animation: yoyo-bubble 700ms ease-out both; }
.yoyo-speech { position: absolute; bottom: calc(100% + 10px); left: 0; width: max-content; max-width: min(240px, calc(100vw - 64px)); padding: 10px 14px; border: 1px solid var(--brand-border); border-radius: 14px 14px 14px 4px; background: #fff; color: var(--brand-strong); box-shadow: 0 6px 24px #205e9c14; font: 12px/1.7 -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; white-space: normal; text-align: left; pointer-events: none; }
.yoyo-speech:empty { display: none; }
.has-message .yoyo-speech { animation: yoyo-say 180ms var(--ease-out); }
.centered .yoyo-speech { left: 50%; translate: -50% 0; border-radius: 14px; }
@keyframes yoyo-leap { 0%, 100% { transform: none; } 25% { transform: translateY(2px) rotate(-8deg); } 52% { transform: translateY(-9px) rotate(7deg); } 76% { transform: translateY(1px) rotate(-3deg); } }
@keyframes yoyo-bubble { 10% { opacity: .8; } 100% { opacity: 0; transform: translate(var(--drift), var(--lift)) scale(.5); } }
@keyframes yoyo-say { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@media(prefers-reduced-motion:reduce) { .is-playing .buddy-motion, .has-message .yoyo-speech { animation: none; } .yoyo-bubbles { display: none; } }
</style>
