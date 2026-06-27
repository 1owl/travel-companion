// Capture app screenshots into public/shots (used by the landing) + landing
// review shots into shots/. Run with the dev server up.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Creds come from the environment (run: node --env-file=.env scripts/shots.mjs).
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('Set E2E_EMAIL/E2E_PASSWORD (run: node --env-file=.env scripts/shots.mjs)'); process.exit(1) }

mkdirSync('public/shots', { recursive: true })
mkdirSync('shots', { recursive: true })
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 860 } })

// Sign in (app is behind #/app — HashRouter)
await p.goto('http://localhost:5173/#/app')
await p.getByLabel('Email').fill(EMAIL)
await p.getByLabel('Password').fill(PASSWORD)
await p.getByRole('button', { name: 'Sign in' }).click()
await p.getByRole('heading', { name: 'Your trips' }).waitFor({ timeout: 20000 })
// Let the place-aware covers resolve (fetch + image download) before the shot.
await p.waitForFunction(() => {
  const els = [...document.querySelectorAll('.trip-cover')]
  return els.length > 0 && els.every(el => /unsplash/.test(getComputedStyle(el).backgroundImage))
}, { timeout: 15000 }).catch(() => {})
await p.waitForTimeout(900)
await p.screenshot({ path: 'public/shots/trips.png' })

// Discover globe — spin and capture the landed destination
try {
  await p.getByRole('button', { name: 'Spin the globe' }).click()
  await p.waitForTimeout(2900)
  await p.locator('.discover').screenshot({ path: 'public/shots/discover.png' })
} catch (e) { console.log('discover shot skipped:', e.message) }

await p.locator('.trip', { hasText: 'France 2026' }).getByRole('link', { name: 'Open' }).click()

await p.getByRole('button', { name: 'Itinerary' }).click()
await p.getByText('Unscheduled').waitFor({ timeout: 15000 })
await p.waitForTimeout(500)
await p.screenshot({ path: 'public/shots/itinerary.png' })

await p.getByRole('button', { name: 'Booking ledger' }).click()
await p.waitForTimeout(700)
await p.screenshot({ path: 'public/shots/ledger.png' })

await p.getByRole('button', { name: 'Budget engine' }).click()
await p.waitForTimeout(700)
await p.screenshot({ path: 'public/shots/budget.png' })

await p.getByRole('button', { name: 'Planner' }).click()
await p.waitForTimeout(600)
await p.screenshot({ path: 'public/shots/planner.png' })

// Flights (Phase 5) — run a live search so the results table renders
try {
  await p.getByRole('button', { name: 'Flights' }).click()
  await p.getByPlaceholder('From (e.g. LON)').fill('LON')
  await p.getByPlaceholder('To (e.g. PAR)').fill('PAR')
  await p.getByRole('button', { name: 'Find flights' }).click()
  await p.locator('table.data tbody tr').first().waitFor({ timeout: 60000 })
  await p.waitForTimeout(400)
  await p.screenshot({ path: 'public/shots/flights.png' })
} catch (e) { console.log('flights shot skipped:', e.message) }

// Landing review — scroll through first so reveal-on-scroll fires
await p.goto('http://localhost:5173/')
await p.waitForTimeout(900)
await p.screenshot({ path: 'shots/landing-top.png' })
await p.evaluate(async () => {
  await new Promise(res => {
    let y = 0
    const step = () => {
      y += window.innerHeight * 0.7
      window.scrollTo(0, y)
      if (y < document.body.scrollHeight) setTimeout(step, 160)
      else { window.scrollTo(0, 0); setTimeout(res, 500) }
    }
    step()
  })
})
await p.waitForTimeout(700)
await p.screenshot({ path: 'shots/landing-full.png', fullPage: true })
await p.screenshot({ path: 'shots/landing-features.png' })

// Destinations gallery — wait for the live photos to fully load, then crop it.
await p.locator('.lp-gallery').scrollIntoViewIfNeeded()
await p.waitForFunction(() => {
  const imgs = [...document.querySelectorAll('.lp-shot img')]
  return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0 && /unsplash/.test(i.src))
}, { timeout: 15000 }).catch(() => {})
await p.waitForTimeout(500)
await p.locator('.lp-gallery').screenshot({ path: 'shots/landing-gallery.png' })

await b.close()
console.log('done')
