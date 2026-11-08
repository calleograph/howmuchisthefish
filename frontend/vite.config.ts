import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Весь REST API администратора — под /api (не конфликтует с фронтенд-роутами
    // SPA типа /employees). /lp/{slug} и /t/* — публичные встраиваемые в письма
    // роуты без префикса, проксируются отдельно. В проде префиксацию делает
    // reverse proxy (Caddy/Nginx), см. deployment/.
    proxy: {
      '/api': 'http://localhost:3000',
      '/lp': 'http://localhost:3000',
      '/t': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
})
