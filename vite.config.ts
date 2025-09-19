import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.json') || url.pathname.startsWith('/data/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'data-cache',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60
              }
            }
          }
        ]
      },
      manifest: {
        name: 'PMS Web',
        short_name: 'PMS',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0b0f',
        theme_color: '#0ea5e9',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@tauri-apps/api/fs': path.resolve(__dirname, 'src/tauri-fs-impl.ts'),
      '@tauri-apps/plugin-stronghold': path.resolve(__dirname, 'src/tauri-stronghold-stub.ts')
    }
  }
})
