<script setup>
import { computed } from 'vue'
const props = defineProps({
  state: { type: String, default: 'welcome', validator: value => ['welcome', 'planning', 'success', 'empty'].includes(value) },
  size: { type: Number, default: 64 }
})
const positions = { welcome: '0%', planning: '33.333333%', success: '66.666667%', empty: '100%' }
const spriteStyle = computed(() => ({
  '--guide-size': `${props.size}px`,
  backgroundImage: `url("${import.meta.env.BASE_URL}brand/dolphin-states.png")`,
  backgroundPosition: `${positions[props.state] || '0%'} center`
}))
</script>
<template><span class="dolphin-guide" :class="state" :style="spriteStyle" aria-hidden="true"></span></template>
<style scoped>
.dolphin-guide { display: inline-block; flex: none; height: var(--guide-size); width: calc(var(--guide-size) * .75); background-repeat: no-repeat; background-size: 400% 100%; vertical-align: middle; }
.welcome, .success { animation: guide-hello 560ms cubic-bezier(.2,.7,.2,1) both; transform-origin: 55% 75%; }
.planning { animation: guide-think 2s ease-in-out infinite; }
@keyframes guide-hello { 0% { transform: translateY(3px) rotate(-6deg); opacity: 0; } 55% { transform: translateY(-1px) rotate(3deg); opacity: 1; } 100% { transform: none; opacity: 1; } }
@keyframes guide-think { 50% { transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .dolphin-guide { animation: none; } }
</style>
