import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: { '/api/wishes': 'http://127.0.0.1:8787' },
    host: true, // 局域网可访问，方便真机调试
  },
  preview: {
    port: 4173,
    proxy: { '/api/wishes': 'http://127.0.0.1:8787' },
    host: true, // 预览打包产物时同样允许局域网访问
  },
})
