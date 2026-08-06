import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/pitch-tracker/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The standalone Brackets app lives at /pitch-tracker/brackets/ and ships
      // its own service worker. Keep Pitch Tracker's worker out of it entirely.
      workbox: {
        globIgnores: ['brackets/**'],
        navigateFallbackDenylist: [/^\/pitch-tracker\/brackets\//],
      },
      manifest: {
        name: 'Pitch Tracker',
        short_name: 'PitchTrack',
        description: 'Softball pitch tracking and scouting',
        theme_color: '#e8eef7',
        background_color: '#e8eef7',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
