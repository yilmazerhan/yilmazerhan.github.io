/**
 * E2E: Authentication flows — login, logout, forgot/reset password
 */
import { test, expect } from '@playwright/test'
import { uniqueEmail, registerAndActivate, loginUI } from './helpers'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@example.com'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Admin123!'

test.describe('Login page', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /giriş|login/i })).toBeVisible()
    await expect(page.getByLabel(/e-posta|email/i)).toBeVisible()
    await expect(page.getByLabel(/şifre|password/i)).toBeVisible()
  })

  test('rejects wrong credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/e-posta|email/i).fill('wrong@email.com')
    await page.getByLabel(/şifre|password/i).fill('BadPassword!')
    await page.getByRole('button', { name: /giriş yap|login|sign in/i }).click()
    await expect(page.getByText(/hata|invalid|incorrect|geçersiz/i)).toBeVisible({ timeout: 5000 })
  })

  test('superadmin can login successfully', async ({ page }) => {
    await loginUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await expect(page).not.toHaveURL('/login')
  })
})

test.describe('Forgot password flow', () => {
  test('shows forgot password page', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.getByRole('heading', { name: /şifre|password/i })).toBeVisible()
  })

  test('accepts any email without revealing existence', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByLabel(/e-posta|email/i).fill('nonexistent@nowhere.invalid')
    await page.getByRole('button', { name: /gönder|send|sıfırla/i }).click()
    // Must show success even for nonexistent email (user enumeration prevention)
    await expect(page.getByText(/gönderildi|sent|e-posta/i)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Logout', () => {
  test('superadmin can logout', async ({ page }) => {
    await loginUI(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    // Find and click logout button
    await page.getByRole('button', { name: /çıkış|logout|sign out/i }).click()
    await expect(page).toHaveURL(/login/)
  })
})

test.describe('Register + activate flow', () => {
  test('can register a new account', async ({ page, request }) => {
    const email = uniqueEmail('reg')
    await page.goto('/login')
    const registerLink = page.getByRole('link', { name: /kayıt ol|register|sign up/i })
    if (await registerLink.isVisible()) {
      await registerLink.click()
      await page.getByLabel(/e-posta|email/i).fill(email)
      await page.getByLabel(/ad soyad|full name|isim/i).fill('E2E Test User')
      await page.getByLabel(/şifre|password/i).first().fill('Test1234!')
      await page.getByRole('button', { name: /kayıt|register|sign up/i }).click()
      await expect(page.getByText(/aktivasyon|activation|e-posta/i)).toBeVisible({ timeout: 5000 })
    } else {
      // Register via API if no UI link
      const resp = await request.post('/api/v1/auth/register', {
        data: { email, password: 'Test1234!', full_name: 'E2E Test User' },
        ignoreHTTPSErrors: true,
      })
      expect(resp.status()).toBe(201)
    }
  })
})
