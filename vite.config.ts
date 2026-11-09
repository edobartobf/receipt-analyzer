import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// L'app è pubblicata su https://edobartobf.github.io/receipt-analyzer/
const BASE = '/receipt-analyzer/'

export default defineConfig({
  base: BASE,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'icona-192.png', 'icona-512.png'],
      manifest: {
        name: 'Scontrini',
        short_name: 'Scontrini',
        description: 'Scontrini fotografati e spese divise tra colleghi',
        lang: 'it',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f5f8',
        theme_color: '#2d4f8f',
        icons: [
          { src: 'icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icona-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
})
