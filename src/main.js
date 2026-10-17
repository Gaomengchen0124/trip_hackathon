import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/base.css'
import { installPhotoTransitions } from './utils/photo-transition'
import { installCursorBubbles } from './utils/cursor-bubbles'

const stopPhotoTransitions = installPhotoTransitions(router)
if (import.meta.hot) import.meta.hot.dispose(stopPhotoTransitions)
const stopCursorBubbles = installCursorBubbles(router)
if (import.meta.hot) import.meta.hot.dispose(stopCursorBubbles)

createApp(App).use(createPinia()).use(router).mount('#app')
