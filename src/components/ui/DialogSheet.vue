<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
const props = defineProps({
  title: { type: String, required: true },
  busy: Boolean,
  side: Boolean
})
const emit = defineEmits(['close'])
const dialog = ref(null)
const closing = ref(false)
let closeTimer
let previousOverflow
let opener
onMounted(() => {
  opener = document.activeElement
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
})
onBeforeUnmount(() => {
  clearTimeout(closeTimer)
  dialog.value?.close()
  document.body.style.overflow = previousOverflow
  if (opener?.isConnected) opener.focus({ preventScroll: true })
})
function close() {
  if (props.busy || closing.value) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return emit('close')
  closing.value = true
  const duration = getComputedStyle(dialog.value).getPropertyValue('--motion-exit').trim()
  const milliseconds = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000)
  closeTimer = setTimeout(finishClose, (Number.isFinite(milliseconds) ? milliseconds : 180) + 80)
}
function finishClose() {
  if (!closing.value) return
  clearTimeout(closeTimer)
  closing.value = false
  emit('close')
}
function backdrop(event) {
  if (!dialog.value || event.target !== dialog.value) return
  const box = dialog.value.getBoundingClientRect()
  if (
    event.target === dialog.value &&
    (event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom)
  )
    close()
}
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="sheet"
      :class="{ 'is-closing': closing, 'is-side': side }"
      :aria-label="title"
      :aria-busy="busy"
      @cancel.prevent="close"
      @click="backdrop"
      @animationend="event => { if (event.target === event.currentTarget && closing) finishClose() }"
    >
      <header>
        <h2>{{ title }}</h2>
        <button
          type="button"
          class="close"
          :disabled="busy || closing"
          aria-label="关闭弹层"
          @click="close"
        >
          ×
        </button>
      </header>
      <slot />
    </dialog>
  </Teleport>
</template>
<style scoped>
.sheet {
  border: 1px solid var(--line);
  color: var(--ink);
  background: #fff;
  border-radius: 22px;
  width: min(640px, calc(100% - 32px));
  max-height: calc(100dvh - 40px);
  margin: auto;
  padding: 24px;
  overflow: auto;
  box-shadow: 0 18px 80px #2b2b2b30;
  animation: surface-enter var(--motion-normal) var(--ease-out) both;
}
.sheet.is-closing { animation: surface-exit var(--motion-exit) var(--ease-in) both; pointer-events: none; }
.sheet.is-side { margin: 0 0 0 auto; height: 100dvh; max-height: 100dvh; width: min(620px, 100%); border-radius: 22px 0 0 22px; }
.sheet::backdrop {
  background: #18324acc;
  opacity: 0.65;
  animation: surface-backdrop-enter var(--motion-normal) var(--ease-out);
}
.sheet.is-closing::backdrop { animation: surface-backdrop-exit var(--motion-exit) var(--ease-in) both; }
header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 16px;
}
h2 {
  font-size: 20px;
  font-family: serif;
  line-height: 1.5;
}
.close {
  font-size: 26px;
  line-height: 1;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg);
  flex-shrink: 0;
}
.close:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 3px;
}
.close:disabled {
  opacity: 0.4;
  cursor: wait;
}
@media (max-width: 600px) {
  .sheet {
    width: 100%;
    max-height: 88dvh;
    max-width: none;
    margin: auto 0 0;
    border-radius: 22px 22px 0 0;
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  }
}
@media (prefers-reduced-motion: reduce) { .sheet, .sheet::backdrop { animation: none; } }
</style>
