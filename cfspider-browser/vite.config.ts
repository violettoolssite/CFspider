import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    include: [
      'zustand',
      'react',
      'react-dom',
      'react-markdown',
      'react-syntax-highlighter',
      'html-react-parser',
      'style-to-js',
      'debug'
    ]
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5174
  }
})
