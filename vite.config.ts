import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isTauri = !!process.env.TAURI_PLATFORM

export default defineConfig({
  // Tauri 用相对路径，Web 用绝对路径
  base: isTauri ? './' : '/',
  plugins: [
    react(),
    // 桌面端禁用 SW，避免缓存导致白屏
    VitePWA({
      registerType: 'autoUpdate',
      disable: isTauri,
    }),
  ],

  // 关键修复：允许顶层 await
  esbuild: { target: isTauri ? 'es2022' : 'es2020' },
  build: {
    target: isTauri ? 'es2022' : 'es2020',
    sourcemap: false,
  },
})
