import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: true, // 局域网可访问，方便真机调试
    proxy: {
      // 本地 dev 时把瓦片请求代理到 OSM，行为与生产（经首尔服务器中转）一致
      '/tiles': {
        target: 'https://tile.openstreetmap.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tiles/, ''),
      },
    },
  },
  preview: {
    port: 4173,
    host: true, // 预览打包产物时同样允许局域网访问
  },
})
