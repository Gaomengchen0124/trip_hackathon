<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { mountComments } from '../auth/comments.mjs'
import '../auth/comments.css'
import '../auth/login-dialog.css'
const props = defineProps({ entityKey: { type: String, required: true } })
const root = ref(null)
let cleanup
function mount() { cleanup?.(); if (root.value) cleanup = mountComments(root.value, props.entityKey) }
onMounted(mount)
watch(() => props.entityKey, mount)
onUnmounted(() => cleanup?.())
</script>
<template><section ref="root" aria-label="巡礼交流"></section></template>
