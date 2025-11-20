import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
    ,
    proxy: {
      // proxy API calls to backend so cookies and sessions work in dev
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
        // do not rewrite path; passthrough
      }
    }
  }
})
