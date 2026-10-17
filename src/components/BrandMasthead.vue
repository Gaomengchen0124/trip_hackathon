<script setup>
import banners from '../data/banner-images.json'
const base = import.meta.env.BASE_URL
const srcset = key => banners[key].variants.map(image => `${base}${image.src} ${image.width}w`).join(', ')
</script>
<template>
  <header class="home-masthead"><h1><picture>
    <source type="image/webp" media="(max-width: 600px)" :srcset="srcset('skyMobile')" sizes="100vw" />
    <source type="image/webp" :srcset="srcset('sky')" sizes="100vw" />
    <source media="(max-width: 600px)" :srcset="`${base}brand/story-pilgrim-mobile-blue.png`" />
    <img :src="`${base}brand/story-pilgrim-blue.png`" width="2021" height="778" alt="Story Pilgrim · 我的圣地巡礼" fetchpriority="high" />
  </picture></h1></header>
</template>
<style scoped>
.home-masthead { width: 100%; overflow: hidden; background: var(--bg); }
h1 { position: relative; width: 100%; aspect-ratio: 2021 / 365; margin: 0; overflow: hidden; line-height: 0; }
picture { display: contents; }
img { display: block; width: 100%; height: auto; position: absolute; top: 0; left: 0; transform: translateY(-28.92%); }
@media (max-width: 600px) { h1 { aspect-ratio: 3 / 1; } img { position: static; transform: none; } }
</style>
