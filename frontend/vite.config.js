import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': {},
    process: {
      nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
    },
  },
})
