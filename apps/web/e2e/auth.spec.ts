import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in|login/i })).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login')
    const inputs = page.getByRole('textbox')
    await inputs.first().fill('wrong@example.com')
    const pwInput = page.locator('input[type="password"]')
    await pwInput.fill('wrongpassword')
    await page.getByRole('button', { name: /sign in|login/i }).click()
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 5000 })
  })
})
