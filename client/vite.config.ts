import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const api = process.env.API_URL ?? 'http://localhost:4000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Na hospedagem, client/public/assets (centenas de MB) é servido direto pelo servidor; não precisa ser copiado para dist.
  build: { copyPublicDir: process.env.RC_SKIP_PUBLIC_COPY !== '1' },
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
      '/socket.io': { target: api, ws: true },
    },
  },
})
