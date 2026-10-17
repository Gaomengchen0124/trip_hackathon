import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/base.css'
import './assets/themes.css'
import './assets/journal.css'
import './assets/atlas-pages.css'
import './assets/atlas-motion.css'
import { installPhotoTransitions } from './utils/photo-transition'
import { installPencilCursor } from './utils/pencil-cursor'

const stopPhotoTransitions = installPhotoTransitions(router)
if (import.meta.hot) import.meta.hot.dispose(stopPhotoTransitions)
const stopPencilCursor = installPencilCursor(router)
if (import.meta.hot) import.meta.hot.dispose(stopPencilCursor)

createApp(App).use(createPinia()).use(router).mount('#app')
