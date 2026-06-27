import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // Dev runs at root (/); the production build is served from the GitHub Pages
  // project path. Absolute base = assets/globe texture/screenshots resolve
  // reliably regardless of trailing slash. (Change if you move to a root domain.)
  base: command === 'build' ? '/travel-companion/' : '/',
  plugins: [react()],
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false,
    // Playwright specs live under e2e/ and use their own runner.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
}))
