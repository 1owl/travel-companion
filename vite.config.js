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
    // Playwright specs live under e2e/ and use their own runner. The explicit
    // exclude list replaces Vitest's defaults, so **/node_modules/** must be
    // listed or dependency tests under server/*/node_modules get collected.
    exclude: ['e2e/**', '**/node_modules/**', 'dist/**'],
  },
}))
