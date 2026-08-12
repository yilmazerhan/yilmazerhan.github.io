/**
 * E2E: Branding — company name visible on login page, public branding endpoint
 */
import { test, expect } from '@playwright/test'

test.describe('Public branding', () => {
  test('login page loads without auth', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/.+/)
    // Form elements present
    await expect(page.getByLabel(/e-posta|email/i)).toBeVisible()
  })

  test('public branding API responds', async ({ request }) => {
    const resp = await request.get('/api/v1/public/branding', { ignoreHTTPSErrors: true })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('company_name')
  })
})
