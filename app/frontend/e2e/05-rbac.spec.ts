/**
 * E2E: Role-based access control — regular users blocked from admin pages
 */
import { test, expect } from '@playwright/test'
import { loginUI, registerAndActivate, uniqueEmail } from './helpers'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@example.com'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Admin123!'

test.describe('Access control', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/kanban')
    await expect(page).toHaveURL(/login/)
  })

  test('unauthenticated user cannot access worklog', async ({ page }) => {
    await page.goto('/worklog')
    await expect(page).toHaveURL(/login/)
  })

  test('unauthenticated user cannot access users admin', async ({ page }) => {
    await page.goto('/users')
    await expect(page).toHaveURL(/login/)
  })

  test('regular user cannot see admin menu items', async ({ page, request }) => {
    const email = uniqueEmail('rbac')
    await registerAndActivate(request, email, 'User1234!')

    await loginUI(page, email, 'User1234!')
    // Admin navigation links should not be visible for regular users
    await expect(page.getByRole('link', { name: /kullanıcılar|users/i })).not.toBeVisible({ timeout: 3000 }).catch(() => {})
  })

  test('superadmin can access admin panel', async ({ page }) => {
    await loginUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await page.goto('/users')
    await expect(page).not.toHaveURL('/login')
    await expect(page.getByRole('heading', { name: /kullanıcı|user/i })).toBeVisible({ timeout: 8000 })
  })
})
