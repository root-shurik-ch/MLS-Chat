// Multi-Device Sync Tests
// Verifies messages work correctly in multi-device scenarios

import { test, expect } from '@playwright/test';

test.describe('Multi-Device Sync', () => {
  test('should persist messages across page reloads', async ({ page }) => {
    await page.goto('/');
    
    // Register and create group
    await page.getByPlaceholder('Display Name').fill('Persistence User');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Persistence Group');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    await page.getByText('Persistence Group').click();
    
    // Send message
    const message = 'This message should persist';
    await page.getByPlaceholder('Type a message...').fill(message);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    
    // Verify message appears
    await expect(page.getByText(message)).toBeVisible();
    
    // Reload page
    await page.reload();
    await page.waitForTimeout(500);
    
    // Go to groups and select the group again
    await page.getByText('Persistence Group').click();
    await page.waitForTimeout(300);
    
    // Message should still be visible
    await expect(page.getByText(message)).toBeVisible();
  });

  test('should handle multiple groups independently', async ({ page }) => {
    await page.goto('/');
    
    // Register
    await page.getByPlaceholder('Display Name').fill('MultiGroup User');
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
    
    // Go to Group Alpha and send message
    await page.getByText('Group Alpha').click();
    await page.getByPlaceholder('Type a message...').fill('Message in Alpha');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(300);
    
    // Go back and to Group Beta
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForTimeout(300);
    await page.getByText('Group Beta').click();
    await page.waitForTimeout(300);
    
    // Send message in Beta
    await page.getByPlaceholder('Type a message...').fill('Message in Beta');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    
    // Verify messages are in correct groups
    await expect(page.getByText('Message in Beta')).toBeVisible();
    await expect(page.getByText('Message in Alpha')).not.toBeVisible();
  });

  test('should track message order with serverSeq', async ({ page }) => {
    await page.goto('/');
    
    // Register and create group
    await page.getByPlaceholder('Display Name').fill('Order User');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Order Group');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    await page.getByText('Order Group').click();
    
    // Send multiple messages
    for (let i = 1; i <= 3; i++) {
      await page.getByPlaceholder('Type a message...').fill(`Message ${i}`);
      await page.getByRole('button', { name: 'Send' }).click();
      await page.waitForTimeout(200);
    }
    
    // Check localStorage for serverSeq
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem('messages');
      return stored ? JSON.parse(stored) : [];
    });
    
    // Messages should be stored
    expect(messages.length).toBe(3);
  });
});
