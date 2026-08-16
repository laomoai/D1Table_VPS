import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'logo.png', 'favicon-32.png', 'icons/apple-touch-180.png'],
      manifest: {
        name: '墨问',
        short_name: '墨问',
        description: '把和 Agent 沟通的结果存进表格与笔记',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#f7f7f5',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: /\/api\//, handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  // 开发时将 /api 代理到本地 Worker（wrangler dev 端口 8787）
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:18085',
        changeOrigin: true,
      },
    },
  },
  // 构建输出到 Worker 的 public 目录，wrangler deploy 时一起打包
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
})
