<script setup>
import { onMounted, onUnmounted } from 'vue'
import InterestDialog from './components/InterestDialog.vue'
import { initInterests, profileState, openInterests } from './recommendation/profile.mjs'
import AuthStatus from './components/AuthStatus.vue'
import BrandMasthead from './components/BrandMasthead.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const editInterests = () => openInterests()
onMounted(() => { initInterests(); window.addEventListener('travel-edit-interests', editInterests) })
onUnmounted(() => window.removeEventListener('travel-edit-interests', editInterests))
</script>

<template>
  <BrandMasthead v-if="route.path === '/'" />
  <header v-else class="app-header">
    <router-link to="/" class="brand">📖 我的圣地巡礼</router-link>
  </header>
  <div class="account-dock"><AuthStatus /></div>
  <router-view v-slot="{ Component }">
    <KeepAlive include="HomeView">
      <component :is="Component" />
    </KeepAlive>
  </router-view>
  <InterestDialog v-if="profileState.open" />
</template>

<style scoped>
.app-header {
  padding: 12px 20px; background: #fff; border-bottom: 1px solid var(--line);
}
.brand { font-weight: 600; letter-spacing: 1px; }
.account-dock { width:calc(100% - 32px);max-width:1080px;margin:10px auto 0;display:flex;justify-content:flex-end; }
.account-dock :deep(.auth-status) { padding:6px 0;border:0;background:transparent;width:fit-content;max-width:100%; }

</style>
