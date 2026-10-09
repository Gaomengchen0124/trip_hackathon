<script setup>
</script>

<template>
  <header class="app-header">
    <router-link to="/" class="brand">📖 我的圣地巡礼</router-link>
  </header>
  <router-view />
</template>

<style scoped>
.app-header {
  padding: 12px 20px; background: #fff; border-bottom: 1px solid var(--line);
}
.brand { font-weight: 600; letter-spacing: 1px; }
</style>
