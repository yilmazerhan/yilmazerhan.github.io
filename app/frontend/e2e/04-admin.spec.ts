/**
 * E2E: Admin features — user management, teams, email workflows
 */
import { test, expect } from '@playwright/test'
import { loginUI, uniqueEmail } from './helpers'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@example.com'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Admin123!'

test.describe('User management (superadmin)', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
  })

  test('can view users list', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: /kullanıcı|user/i })).toBeVisible({ timeout: 8000 })
    // Superadmin appears in the list
    await expect(page.getByText(SUPERADMIN_EMAIL)).toBeVisible({ timeout: 8000 })
  })

  test('can view teams list', async ({ page }) => {
    await page.goto('/teams')
    await expect(page.getByRole('heading', { name: /takım|team/i })).toBeVisible({ timeout: 8000 })
  })

  test('can navigate to permissions page', async ({ page }) => {
    await page.goto('/permissions')
    await expect(page.getByRole('heading', { name: /yetki|permission/i })).toBeVisible({ timeout: 8000 })
  })
})

test.describe('Email settings (superadmin)', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
  })

  test('can view email templates page', async ({ page }) => {
    await page.goto('/settings/email/templates')
    await expect(page.getByRole('heading', { name: /şablon|template/i })).toBeVisible({ timeout: 8000 })
  })

  test('can view email workflows page', async ({ page }) => {
    await page.goto('/settings/email/workflows')
    await expect(page.getByRole('heading', { name: /workflow|iş akışı/i })).toBeVisible({ timeout: 8000 })
  })
})

test.describe('Settings page', () => {
  test('can reach settings', async ({ page }) => {
    await loginUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await page.goto('/settings')
    await expect(page).not.toHaveURL('/login')
  })
})
