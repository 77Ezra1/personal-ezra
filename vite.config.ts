import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isDesktop = process.env.VITE_DESKTOP === '1' || !!process.env.TAURI_PLATFORM
const buildTarget = 'es2022'

export default defineConfig({
  // Tauri 用相对路径，Web 用绝对路径
  base: isDesktop ? './' : '/',
  plugins: [react(), ...(!isDesktop ? [VitePWA({ registerType: 'autoUpdate', injectRegister: 'auto' })] : [])],

  // 关键修复：允许顶层 await
  esbuild: { target: buildTarget },
  build: {
    target: buildTarget,
    sourcemap: false,
  },
})
