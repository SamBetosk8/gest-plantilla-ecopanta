import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), 
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.jpg'], 
      manifest: {
        name: 'Ecopanta Gestión',
        short_name: 'Ecopanta',
        description: 'Sistema de Gestión de Planillas y Facturas',
        theme_color: '#ffffff',
        background_color: '#f8fafc',
        display: 'standalone', 
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})