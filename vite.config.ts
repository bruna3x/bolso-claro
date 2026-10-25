/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = '/bolso-claro/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg'],
      manifest: {
        name: 'Bolso Claro — Finanças pessoais',
        short_name: 'Bolso Claro',
        description: 'Seu dinheiro, sem surpresas.',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F6F5EF',
        theme_color: '#123B32',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true
      },
      devOptions: { enabled: true }
    })
  ],
  server: { host: '0.0.0.0', port: 3000, strictPort: true },
  test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'] }
});
