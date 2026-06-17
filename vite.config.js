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
  },
})
