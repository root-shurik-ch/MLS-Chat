// Full E2E Flow Tests
// Complete end-to-end tests covering all user journeys

import { test, expect } from '@playwright/test';

test.describe('Full E2E Flow', () => {
  test('complete user journey: register → create group → send message', async ({ page }) => {
    // Step 1: Registration
    await page.goto('/');
    
    await page.getByPlaceholder('Display Name').fill('E2E Test User');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    // Verify registration succeeded
    const userId = await page.evaluate(() => localStorage.getItem('userId'));
    const deviceId = await page.evaluate(() => localStorage.getItem('deviceId'));
    
    expect(userId).toBeTruthy();
    expect(deviceId).toBeTruthy();
    
    // Step 2: Create Group
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('E2E Test Group');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    // Verify group was created
    await expect(page.getByText('E2E Test Group')).toBeVisible();
    
    // Step 3: Send Message
    await page.getByText('E2E Test Group').click();
    const testMessage = 'Hello from E2E test!';
    await page.getByPlaceholder('Type a message...').fill(testMessage);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    
    // Verify message was sent
    await expect(page.getByText(testMessage)).toBeVisible();
  });

  test('user can switch between groups', async ({ page }) => {
    await page.goto('/');
    
    // Register
    await page.getByPlaceholder('Display Name').fill('Switch User');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    // Create multiple groups
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Group Alpha');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(300);
    
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Group Beta');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(300);
    
    // Verify all groups exist
    await expect(page.getByText('Group Alpha')).toBeVisible();
    await expect(page.getByText('Group Beta')).toBeVisible();
    
    // Switch to Group Beta
    await page.getByText('Group Beta').click();
    await page.waitForTimeout(300);
    
    // Send message to Group Beta
    await page.getByPlaceholder('Type a message...').fill('Message in Beta');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(300);
    
    // Switch to Group Alpha
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForTimeout(300);
    await page.getByText('Group Alpha').click();
    await page.waitForTimeout(300);
    
    await page.getByPlaceholder('Type a message...').fill('Message in Alpha');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(300);
    
    // Verify messages are in correct groups
    await expect(page.getByText('Message in Alpha')).toBeVisible();
  });

  test('message flow with back navigation', async ({ page }) => {
    await page.goto('/');
    
    // Register
    await page.getByPlaceholder('Display Name').fill('Nav User');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    // Create group
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Nav Group');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    // Open chat
    await page.getByText('Nav Group').click();
    await page.waitForTimeout(300);
    
    // Send message
    await page.getByPlaceholder('Type a message...').fill('Test message');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(300);
    
    // Go back
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForTimeout(300);
    
    // Should see group list
    await expect(page.getByText('Nav Group')).toBeVisible();
    
    // Open chat again
    await page.getByText('Nav Group').click();
    await page.waitForTimeout(300);
    
    // Message should still be there
    await expect(page.getByText('Test message')).toBeVisible();
  });
});
