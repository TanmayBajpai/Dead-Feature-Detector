import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/findings': 'http://localhost:8421',
      '/source':   'http://localhost:8421',
      '/graph':    'http://localhost:8421',
      '/stats':    'http://localhost:8421',
      '/run':      { target: 'http://localhost:8421', changeOrigin: false },
    },
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
  },
})
