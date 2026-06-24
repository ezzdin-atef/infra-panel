import { test, expect } from '@playwright/test'

test.describe('Docker', () => {
  test('docker page is accessible', async ({ page }) => {
    await page.goto('/docker')
    const isLogin = page.url().includes('/login') || page.url().includes('/setup')
    if (isLogin) { test.skip(); return }
    await expect(page.getByRole('heading')).toBeVisible()
  })
})
