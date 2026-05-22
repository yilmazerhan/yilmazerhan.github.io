/**
 * E2E: Work log — create, view, edit (3-day rule), delete
 */
import { test, expect } from '@playwright/test'
import { loginUI, registerAndActivate, uniqueEmail } from './helpers'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@example.com'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Admin123!'

test.describe('Work log page', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await page.goto('/worklog')
  })

  test('worklog page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /iş günlüğü|work log/i })).toBeVisible({ timeout: 8000 })
  })

  test('can open new work log form', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /yeni kayıt|add|ekle|log/i })
    await expect(addBtn).toBeVisible({ timeout: 8000 })
    await addBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 })
  })

  test('can create a work log entry', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /yeni kayıt|add|ekle|log/i })
    await addBtn.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Fill in the form
    const descField = dialog.getByLabel(/açıklama|description/i)
    await descField.fill('E2E test iş kaydı')

    const hoursField = dialog.getByLabel(/saat|hours|süre/i)
    await hoursField.fill('2')

    await page.getByRole('button', { name: /kaydet|save|submit/i }).click()
    await expect(page.getByText(/E2E test iş kaydı/)).toBeVisible({ timeout: 5000 })
  })
})
