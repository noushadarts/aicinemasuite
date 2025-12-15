import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  return {
    plugins: [react()],
    define: {
      // Safely define only the specific key we need, rather than replacing the whole object
      // This prevents 'process.env.NODE_ENV is undefined' errors in some libraries
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
    },
    build: {
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            icons: ['lucide-react'],
            genai: ['@google/genai']
          }
        }
      }
    }
  }
})