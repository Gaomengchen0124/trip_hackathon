<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import InterestDialog from './components/InterestDialog.vue'
import { initInterests, profileState, openInterests } from './recommendation/profile.mjs'
import SiteNavigation from './components/SiteNavigation.vue'
import TravelMasthead from './components/TravelMasthead.vue'
import OpeningSequence from './components/OpeningSequence.vue'
import StoryChapter from './components/StoryChapter.vue'
import StoryFooter from './components/StoryFooter.vue'
import JourneyCompanion from './components/JourneyCompanion.vue'
import { installStoryMotion } from './utils/story-motion'
import { shouldShowOpening } from './utils/opening-sequence.mjs'
import { useRoute } from 'vue-router'
const route = useRoute()
const introProgress = ref((() => {
  try { return shouldShowOpening(window.location, window.sessionStorage) }
  catch { return shouldShowOpening(window.location, null) }
})() ? 0 : 1)
const introOpen = computed(() => route.name === 'home' && introProgress.value < 1)
function replayOpening() {
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
}
const editInterests = () => openInterests()
let stopStoryMotion
onMounted(() => { initInterests(); stopStoryMotion = installStoryMotion(); window.addEventListener('travel-edit-interests', editInterests) })
onUnmounted(() => { stopStoryMotion?.(); window.removeEventListener('travel-edit-interests', editInterests) })
</script>

<template>
  <OpeningSequence v-if="route.name === 'home'" @progress="introProgress = $event" />
  <div class="story-content" :class="{ 'public-story': !route.meta.admin, 'is-unfolding': introOpen }" :inert="introOpen" :style="introOpen ? { '--arrival': Math.min(1, introProgress * 1.5) } : undefined">
    <SiteNavigation />
    <TravelMasthead v-if="route.path === '/'" @replay-opening="replayOpening" />
    <StoryChapter v-else-if="!route.meta.admin" :key="route.name" :route-name="route.name" />
    <router-view v-slot="{ Component }">
      <KeepAlive include="HomeView">
        <component :is="Component" />
      </KeepAlive>
    </router-view>
    <StoryFooter v-if="!route.meta.admin" />
    <JourneyCompanion v-if="route.name === 'home' && !introOpen" />
  </div>
  <InterestDialog v-if="profileState.open && !introOpen" />
</template>
