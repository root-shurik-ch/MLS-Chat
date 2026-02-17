// Registration E2E Tests
// Tests user registration flow

import { test, expect } from '@playwright/test';

test.describe('User Registration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display registration form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
    await expect(page.getByPlaceholder('Display Name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
  });

  test('should allow user to register with display name', async ({ page }) => {
    // Fill in display name
    await page.getByPlaceholder('Display Name').fill('Test User');
    
    // Click register button
    await page.getByRole('button', { name: 'Register' }).click();
    
    // Wait for registration to complete
    await page.waitForTimeout(500);
    
    // Verify user data is stored in localStorage
    const userId = await page.evaluate(() => localStorage.getItem('userId'));
    const deviceId = await page.evaluate(() => localStorage.getItem('deviceId'));
    
    expect(userId).toBeTruthy();
    expect(deviceId).toBeTruthy();
  });

  test('should not allow empty display name', async ({ page }) => {
    // Try to register with empty name - should not crash
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(300);
    
    // Should still show form (validation happens)
    await expect(page.getByPlaceholder('Display Name')).toBeVisible();
  });

  test('should generate unique user ID for each registration', async ({ page }) => {
    // Register first user
    await page.getByPlaceholder('Display Name').fill('User One');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    const userId1 = await page.evaluate(() => localStorage.getItem('userId'));
    
    // Logout and register second user
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForTimeout(300);
    
    await page.getByPlaceholder('Display Name').fill('User Two');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    const userId2 = await page.evaluate(() => localStorage.getItem('userId'));
    
    // User IDs should be different
    expect(userId1).not.toBe(userId2);
  });
});
