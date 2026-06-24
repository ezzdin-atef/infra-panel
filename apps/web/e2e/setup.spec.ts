import { test, expect } from '@playwright/test'

test.describe('Setup flow', () => {
  test('redirects to /setup on first launch', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/setup|\/login/)
  })

  test('setup page has required fields', async ({ page }) => {
    await page.goto('/setup')
    await expect(page.getByRole('textbox').first()).toBeVisible()
  })
})
