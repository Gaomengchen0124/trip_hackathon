<script setup>
import { onMounted, onUnmounted } from 'vue'
import InterestDialog from './components/InterestDialog.vue'
import { initInterests, profileState, openInterests } from './recommendation/profile.mjs'
import SiteNavigation from './components/SiteNavigation.vue'
import TravelMasthead from './components/TravelMasthead.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const editInterests = () => openInterests()
onMounted(() => { initInterests(); window.addEventListener('travel-edit-interests', editInterests) })
onUnmounted(() => window.removeEventListener('travel-edit-interests', editInterests))
</script>

<template>
  <SiteNavigation />
  <TravelMasthead v-if="route.path === '/'" />
  <router-view v-slot="{ Component }">
    <KeepAlive include="HomeView">
      <component :is="Component" />
    </KeepAlive>
  </router-view>
  <InterestDialog v-if="profileState.open" />
</template>
