<script setup>
import banners from '../data/banner-images.json'
const base = import.meta.env.BASE_URL
const srcset = key => banners[key].variants.map(image => `${base}${image.src} ${image.width}w`).join(', ')
const desktopSrcset = srcset('gold')
</script>
<template>
  <header class="home-masthead is-gold"><h1><picture>
    <source type="image/webp" :srcset="desktopSrcset" sizes="100vw" />
    <img :src="`${base}img/story-pilgrim-masthead-v1.png`" width="2021" height="778" alt="Story Pilgrim · 我的圣地巡礼" fetchpriority="high" />
  </picture></h1></header>
</template>
<style scoped>
.home-masthead { width: 100%; overflow: hidden; background: var(--bg); }
h1 { position: relative; width: 100%; aspect-ratio: 2021 / 365; margin: 0; overflow: hidden; line-height: 0; }
picture { display: contents; }
img { display: block; width: 100%; height: auto; position: absolute; top: 0; left: 0; transform: translateY(-28.92%); }
@media (max-width: 600px) { h1 { aspect-ratio: 3 / 1; } img { position: static; transform: none; } }
@media (max-width: 600px) { .is-gold h1 { aspect-ratio: 2021 / 450; } .is-gold img { position: absolute; transform: translateY(-28.92%); } }
</style>
