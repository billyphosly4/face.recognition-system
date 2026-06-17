import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Avoid watching large backend folders and Python environments under this repo
    watch: {
      ignored: [
        '**/venv/**',
        '**/.venv/**',
        '**/__pycache__/**',
        '**/backend/**',
        '**/tourist admin dashboared/**',
      ],
    },
    // Proxy /api requests to the Render backend during local development.
    // This makes requests appear same-origin to the browser — no CORS preflight needed.
    proxy: {
      '/api': {
        target: 'https://backend-face-recognition-jlle.onrender.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
