import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'use-sync-external-store/shim/with-selector': 'use-sync-external-store/shim/with-selector.js'
    }
  },
  optimizeDeps: {
    include: ['zustand', 'use-sync-external-store', 'use-sync-external-store/shim/with-selector'],
    esbuildOptions: {
      mainFields: ['module', 'main']
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    commonjsOptions: {
      include: [/use-sync-external-store/, /node_modules/]
    }
  },
  server: {
    port: 5173
  }
})
