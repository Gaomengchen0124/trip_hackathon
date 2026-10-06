<script setup>
import { computed } from 'vue'
const props = defineProps({
  quote: { type: Object, required: true },
  brief: Boolean
})
const text = computed(() =>
  props.brief ? props.quote.brief : props.quote.full
)
</script>
<template>
  <blockquote class="quote" :class="{ brief }">
    <span class="kind">{{ quote.kind }}</span>
    <p v-if="text" class="text">{{ text }}</p>
    <p v-else class="empty">{{ quote.kind }}内容待补充</p>
    <footer>{{ quote.source || '出处待补充' }}</footer>
  </blockquote>
</template>
<style scoped>
.quote {
  position: relative;
  border-left: 3px solid var(--brand);
  padding: 16px 18px;
  background: var(--bg);
  border-radius: 0 10px 10px 0;
}
.kind {
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--brand);
  font-weight: 600;
}
.text {
  font-size: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.95;
  margin: 8px 0;
  font-family: 'Songti SC', SimSun, serif;
}
.brief .text {
  font-size: 15px;
}
.empty {
  font-size: 13px;
  color: var(--ink-2);
  margin: 8px 0;
}
footer {
  font-size: 11px;
  color: var(--ink-2);
  overflow-wrap: anywhere;
  line-height: 1.6;
}
</style>
