import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the build works at any path (e.g. a GitHub Pages project
  // site like username.github.io/travel-companion). Paired with HashRouter.
  base: './',
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
})
