import { Page, expect } from '@playwright/test'
import { randomUUID } from 'crypto'

export const TEST_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://localhost'
export const API_BASE = `${TEST_BASE_URL}/api/v1`

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}+${randomUUID().slice(0, 8)}@test.local`
}

export async function apiLogin(
  request: import('@playwright/test').APIRequestContext,
  email: string,
  password: string,
) {
  const resp = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
    ignoreHTTPSErrors: true,
  })
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()) as { access_token: string }
}

export async function loginUI(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(/e-posta|email/i).fill(email)
  await page.getByLabel(/şifre|password/i).fill(password)
  await page.getByRole('button', { name: /giriş yap|login|sign in/i }).click()
  await expect(page).toHaveURL(/dashboard|\//)
}

export async function registerAndActivate(
  request: import('@playwright/test').APIRequestContext,
  email: string,
  password: string,
  fullName = 'E2E Test User',
) {
  // Register
  const registerResp = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, full_name: fullName },
    ignoreHTTPSErrors: true,
  })
  expect(registerResp.status()).toBe(201)

  // In test environment, activation token is returned in the register response
  // or the account may be auto-activated. Try direct activation lookup.
  // Activate via superadmin API
  const { access_token } = await apiLogin(request, 'admin@example.com', process.env.SUPERADMIN_PASSWORD || 'Admin123!')
  const usersResp = await request.get(`${API_BASE}/users?search=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${access_token}` },
    ignoreHTTPSErrors: true,
  })
  if (usersResp.ok()) {
    const data = await usersResp.json()
    const user = data.items?.[0]
    if (user && !user.is_active) {
      await request.patch(`${API_BASE}/users/${user.id}`, {
        data: { is_active: true },
        headers: { Authorization: `Bearer ${access_token}` },
        ignoreHTTPSErrors: true,
      })
    }
  }
}
