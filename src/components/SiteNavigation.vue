<script setup>
import { useRoute } from 'vue-router'
import AuthStatus from './AuthStatus.vue'

const route = useRoute()
const links = [
  { to: '/', label: '首页', names: ['home'] },
  { to: '/column/city', label: '巡礼路线', names: ['column', 'route-intro', 'customize', 'poi-detail', 'result', 'itinerary'] },
  { to: '/recommend', label: '智能推荐', names: ['recommend'] },
  { to: '/wishes', label: '巡礼许愿', names: ['wishes'] },
]
const isActive = link => link.names.includes(route.name)
</script>

<template>
  <header class="site-navigation">
    <div class="navigation-inner">
      <router-link class="navigation-brand" to="/" aria-label="我的圣地巡礼，返回首页">
        <span class="brand-emblem" aria-hidden="true">
          <svg viewBox="0 0 36 36" fill="none">
            <path d="M7 10.5c4.2-1.2 7.9-.4 11 2.1 3.1-2.5 6.8-3.3 11-2.1V26c-4.2-1.2-7.9-.4-11 2.1C14.9 25.6 11.2 24.8 7 26V10.5Z" />
            <path d="M18 12.6v15.5M11 15l3.5 1M11 19l3.5 1M22 16l3-1M22 20l3-1" />
            <path class="emblem-star" d="m26 3 1.2 3.8L31 8l-3.8 1.2L26 13l-1.2-3.8L21 8l3.8-1.2L26 3Z" />
          </svg>
        </span>
        <span class="brand-copy"><strong>我的圣地巡礼</strong><span>STORY PILGRIM</span></span>
      </router-link>

      <nav class="navigation-links" aria-label="主导航">
        <router-link v-for="link in links" :key="link.to" :to="link.to"
          class="navigation-link" :class="{ 'is-active': isActive(link) }"
          :aria-current="isActive(link) ? 'page' : undefined">
          <svg v-if="link.to === '/recommend'" class="recommend-spark" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m8 1.5 1.8 4.7L14.5 8l-4.7 1.8L8 14.5l-1.8-4.7L1.5 8l4.7-1.8L8 1.5Z" /></svg>
          {{ link.label }}
        </router-link>
      </nav>

      <div class="navigation-account"><AuthStatus /></div>
    </div>
  </header>
</template>

<style scoped>
.site-navigation {
  position: sticky;
  top: 0;
  z-index: 40;
  flex: none;
  background: rgb(253 251 247 / .95);
  border-bottom: 1px solid var(--brand-border);
  box-shadow: 0 3px 18px rgb(var(--brand-rgb) / .04);
  backdrop-filter: blur(16px);
}
.navigation-inner {
  display: grid;
  grid-template-columns: minmax(185px, 1fr) auto minmax(120px, 1fr);
  align-items: center;
  gap: 24px;
  max-width: 1280px;
  min-height: 76px;
  margin: 0 auto;
  padding: 10px 32px;
}
.navigation-brand { display: inline-flex; align-items: center; gap: 11px; width: fit-content; border-radius: 8px; }
.brand-emblem { display: grid; place-items: center; width: 42px; height: 42px; flex: none; border: 1px solid var(--brand-border); border-radius: 12px; background: linear-gradient(145deg, #fffdf8, var(--brand-light)); color: var(--brand-strong); }
.brand-emblem svg { width: 32px; height: 32px; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.emblem-star { fill: var(--brand); stroke: none; }
.brand-copy { display: grid; gap: 2px; }
.brand-copy strong { font-family: Georgia, 'Songti SC', STSong, serif; font-size: 18px; font-weight: 600; letter-spacing: .1em; white-space: nowrap; }
.brand-copy > span { color: var(--brand); font-size: 9px; letter-spacing: .22em; }
.navigation-links { display: flex; align-items: center; gap: 6px; }
.navigation-link { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px; padding: 9px 16px; border-radius: 10px; color: var(--ink-2); font-size: 14px; white-space: nowrap; transition: background-color var(--motion-fast), color var(--motion-fast); }
.navigation-link.is-active { background: var(--brand-light); color: var(--brand-strong); font-weight: 600; }
.navigation-link.is-active::after { content: ''; position: absolute; bottom: 4px; left: calc(50% - 7px); width: 14px; height: 2px; border-radius: 2px; background: var(--brand); }
.recommend-spark { width: 14px; height: 14px; color: var(--brand); stroke: currentColor; stroke-width: 1.2; }
.navigation-account { justify-self: end; min-width: 0; max-width: 100%; }
.navigation-account :deep(.auth-status) { padding: 0; border: 0; background: transparent; max-width: 100%; border-radius: 0; }
.navigation-account :deep(.identity strong) { max-width: 10ch; font-size: 13px; }
.navigation-account :deep(.hint), .navigation-account :deep(.auth-status > p) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.navigation-brand:focus-visible, .navigation-link:focus-visible { outline: 2px solid var(--brand-strong); outline-offset: 3px; }
@media (hover: hover) { .navigation-link:hover { background: var(--surface-soft); color: var(--brand-strong); } .navigation-link.is-active:hover { background: var(--selection-bg); } }
@media (max-width: 1000px) { .navigation-inner { padding-inline: 20px; gap: 12px; grid-template-columns: minmax(180px, 1fr) auto auto; } .navigation-link { padding-inline: 12px; } }
@media (max-width: 760px) {
  .navigation-inner { grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; padding: 8px 16px 6px; min-height: 112px; }
  .navigation-brand { gap: 8px; }
  .brand-emblem { width: 36px; height: 36px; border-radius: 10px; }
  .brand-emblem svg { width: 28px; height: 28px; }
  .brand-copy strong { font-size: 16px; }
  .brand-copy > span { font-size: 8px; }
  .navigation-links { grid-row: 2; grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .navigation-link { padding: 8px 4px; font-size: 13px; }
  .navigation-account { grid-row: 1; grid-column: 2; }
  .navigation-account :deep(.identity strong) { max-width: 6ch; }
  .navigation-account :deep(.account-trigger) { min-height: 44px; gap: 5px; padding-right: 4px; }
  .navigation-account :deep(.avatar-frame) { width: 36px; height: 36px; }
  .navigation-account :deep(.avatar) { width: 29px; height: 29px; }
}
@media (max-width: 360px) { .navigation-account :deep(.identity) { display: none; } }
@media (prefers-reduced-motion: reduce) { .navigation-link { transition: none; } }
@media print { .site-navigation { display: none; } }
</style>
