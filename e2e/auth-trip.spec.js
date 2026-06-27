import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) throw new Error('Set E2E_EMAIL and E2E_PASSWORD (see .env) to run e2e.')

// Happy path: sign in -> create trip -> add a booking -> add a budget line ->
// assert the trip summary totals update. Cleans up the trip it created.
test('sign in, create a trip, add a booking, budget total updates', async ({ page }) => {
  const tripName = `E2E ${Date.now()}`

  // --- landing page is public (HashRouter) ---
  await page.goto('/#/')
  await expect(page.getByRole('link', { name: 'Open app' })).toBeVisible()

  // --- sign in (app lives behind #/app) ---
  await page.goto('/#/app')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Your trips' })).toBeVisible({ timeout: 15_000 })

  // --- create a trip ---
  await page.getByPlaceholder('Trip name (e.g. France 2026)').fill(tripName)
  await page.getByRole('button', { name: 'Add trip' }).click()

  const card = page.locator('.trip', { hasText: tripName })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.getByRole('link', { name: 'Open' }).click()

  // --- on the trip: add a booking ---
  await expect(page.getByText(tripName).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByPlaceholder('What to book')).toBeVisible()
  await page.getByPlaceholder('What to book').fill('Eiffel Tower summit')
  await page.getByPlaceholder('Cost').fill('100')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Eiffel Tower summit')).toBeVisible()

  // Booked / tracked stat reflects the AUD cost
  const booked = page.locator('.stat', { hasText: 'Booked / tracked' }).locator('.v')
  await expect(booked).toHaveText('$100')

  // --- budget tab: add a line, assert the budget total updates ---
  await page.getByRole('button', { name: 'Budget engine' }).click()
  await page.getByPlaceholder('Item').fill('Contingency')
  await page.getByPlaceholder('Unit price').fill('250')
  await page.getByRole('button', { name: 'Add line' }).click()

  // New line is editable input; assert via its value and the recomputed totals.
  await expect(page.locator('input.cell.wide')).toHaveValue('Contingency')
  const budgetStat = page.locator('.stat', { hasText: 'Budget total' }).locator('.v')
  await expect(budgetStat).toHaveText('$250')

  // --- itinerary tab: the booking shows (Unscheduled, since it has no date) ---
  await page.getByRole('button', { name: 'Itinerary' }).click()
  await expect(page.getByText('Unscheduled')).toBeVisible()
  await expect(page.getByText('Eiffel Tower summit')).toBeVisible()

  // --- cleanup: delete the trip ---
  page.on('dialog', d => d.accept())
  await page.getByRole('link', { name: '← Trips' }).click()
  const cleanupCard = page.locator('.trip', { hasText: tripName })
  await cleanupCard.getByRole('button', { name: 'Delete' }).click()
  await expect(cleanupCard).toHaveCount(0, { timeout: 15_000 })
})
