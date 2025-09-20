import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isTauri = process.env.BUILD_TARGET === 'tauri'

const pwaOptions = {
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
}

export default defineConfig(async () => {
  const plugins = [react()]

  if (!isTauri) {
    try {
      const { VitePWA } = await import('vite-plugin-pwa')
      plugins.push(VitePWA(pwaOptions))
    } catch (error) {
      console.warn('Failed to load vite-plugin-pwa:', error)
    }
  }

  return {
    plugins,
    base: './',
    build: {
      target: 'esnext',
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 200
      }
    },
    preview: {
      host: true,
      port: 5173,
      strictPort: true
    },
    resolve: {
      alias: {
        '@tauri-apps/plugin-stronghold': path.resolve(
          __dirname,
          'src/tauri-stronghold-stub.ts'
        )
      }
    }
  }
})
