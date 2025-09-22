import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isTauri = !!process.env.TAURI_PLATFORM  // Tauri 构建时由 CLI 注入

export default defineConfig({
  // 关键：桌面端改相对路径，避免 app:// / file:// 下 404 => 白屏
  base: isTauri ? './' : '/',
  plugins: [
    react(),
    // 桌面端禁用 SW，避免被旧缓存黏住
    VitePWA({
      registerType: 'autoUpdate',
      disable: isTauri,
    }),
  ],
  build: {
    target: isTauri ? ['es2021'] : 'esnext',
    sourcemap: false,
  },
})
