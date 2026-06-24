import { test, expect } from '@playwright/test'

// These tests assume an already-authenticated session.
// Run after seeding the DB with a test admin account.
test.describe('Dashboard', () => {
  test('dashboard page loads metric cards', async ({ page }) => {
    // Navigate -- if not authed, expect redirect to login
    await page.goto('/dashboard')
    const isLogin = page.url().includes('/login') || page.url().includes('/setup')
    if (isLogin) {
      test.skip()
      return
    }
    await expect(page.getByText(/cpu/i)).toBeVisible({ timeout: 10000 })
  })
})
