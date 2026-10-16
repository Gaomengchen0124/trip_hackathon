<script setup>
import { onMounted, onUnmounted } from 'vue'
import InterestDialog from './components/InterestDialog.vue'
import { initInterests, profileState, openInterests } from './recommendation/profile.mjs'
import AuthStatus from './components/AuthStatus.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const editInterests = () => openInterests()
onMounted(() => { initInterests(); window.addEventListener('travel-edit-interests', editInterests) })
onUnmounted(() => window.removeEventListener('travel-edit-interests', editInterests))
const masthead = `${import.meta.env.BASE_URL}img/story-pilgrim-masthead-v1.png`
</script>

<template>
  <header v-if="route.path === '/'" class="home-masthead">
    <h1><img :src="masthead" width="2021" height="778" alt="Story Pilgrim · 我的圣地巡礼" fetchpriority="high" /></h1>
  </header>
  <header v-else class="app-header">
    <router-link to="/" class="brand">📖 我的圣地巡礼</router-link>
  </header>
  <div class="account-dock"><AuthStatus /></div>
  <router-view />
  <InterestDialog v-if="profileState.open" />
</template>

<style scoped>
.app-header {
  padding: 12px 20px; background: #fff; border-bottom: 1px solid var(--line);
}
.brand { font-weight: 600; letter-spacing: 1px; }
.home-masthead { width:100%; overflow:hidden; background:var(--bg); }
.home-masthead h1 { position:relative; width:100%; aspect-ratio:2021 / 350; margin:0; overflow:hidden; line-height:0; }
.home-masthead img { display:block; width:100%; height:auto; position:absolute; top:0; left:0; transform:translateY(-28.92%); }
.account-dock { width:calc(100% - 32px);max-width:1080px;margin:10px auto 0;display:flex;justify-content:flex-end; }
.account-dock :deep(.auth-status) { padding:6px 0;border:0;background:transparent;width:min(100%,400px); }
.account-dock :deep(.avatar) { width:34px;height:34px; }
.account-dock :deep(.identity span) { display:none; }
.account-dock :deep(.account-row) { gap:10px; }
</style>
