/**
 * E2E: Dashboard — stat cards visible, recent logs and overdue tasks sections render
 */
import { test, expect } from '@playwright/test'
import { loginUI } from './helpers'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@example.com'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Admin123!'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('shows stat cards', async ({ page }) => {
    await expect(page.getByText(/toplam görev|total/i)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/gecikmiş|overdue/i)).toBeVisible({ timeout: 8000 })
  })

  test('shows overdue tasks section', async ({ page }) => {
    await expect(page.getByText(/gecikmiş görevler/i)).toBeVisible({ timeout: 8000 })
  })

  test('shows recent work logs section', async ({ page }) => {
    await expect(page.getByText(/son iş günlüğü|recent/i)).toBeVisible({ timeout: 8000 })
  })
})
