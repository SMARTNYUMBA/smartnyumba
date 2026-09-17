import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Try to import VitePWA — it's optional so the app still builds if not installed
let pwa;
try { ({ VitePWA: pwa } = await import('vite-plugin-pwa')); } catch {}

const plugins = [react()];
if (pwa) {
  plugins.push(pwa({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
    manifest: {
      name:        'SmartNyumba Pro',
      short_name:  'SmartNyumba',
      description: 'Property management, rent collection, and tenant portal',
      theme_color: '#5b7fff',
      background_color: '#07080d',
      display:     'standalone',
      start_url:   '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      runtimeCaching: [
        { urlPattern: /^\/api\/(?!events)/, // cache API responses except SSE
          handler: 'NetworkFirst',
          options: { cacheName: 'api-cache', networkTimeoutSeconds: 5,
            expiration: { maxEntries: 100, maxAgeSeconds: 300 } } },
        { urlPattern: /\.(js|css|woff2?)$/,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'static-assets' } },
      ],
    },
  }));
}

export default defineConfig({
  plugins,
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react','react-dom','react-router-dom'],
          'vendor-query':    ['@tanstack/react-query'],
          'vendor-ui':       ['react-hot-toast'],
        },
      },
    },
  },
});
