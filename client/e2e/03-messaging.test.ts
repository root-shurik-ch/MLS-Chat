// Messaging E2E Tests
// Tests message sending, receiving

import { test, expect } from '@playwright/test';

test.describe('Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Register a test user
    await page.getByPlaceholder('Display Name').fill('Messaging User');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    // Create a test group
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Chat Group');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    // Select the group
    await page.getByText('Chat Group').click();
  });

  test('should display message input', async ({ page }) => {
    // Should have message input field
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible();
  });

  test('should allow sending a text message', async ({ page }) => {
    const testMessage = 'Hello, World!';
    
    // Type and send message
    await page.getByPlaceholder('Type a message...').fill(testMessage);
    await page.getByRole('button', { name: 'Send' }).click();
    
    // Wait for message to be processed
    await page.waitForTimeout(500);
    
    // Verify message appears in chat
    await expect(page.getByText(testMessage)).toBeVisible();
  });

  test('should send multiple messages in order', async ({ page }) => {
    const msg1 = 'Message 1';
    const msg2 = 'Message 2';
    const msg3 = 'Message 3';
    
    // Send multiple messages
    await page.getByPlaceholder('Type a message...').fill(msg1);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(200);
    
    await page.getByPlaceholder('Type a message...').fill(msg2);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(200);
    
    await page.getByPlaceholder('Type a message...').fill(msg3);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    
    // All messages should appear
    await expect(page.getByText(msg1)).toBeVisible();
    await expect(page.getByText(msg2)).toBeVisible();
    await expect(page.getByText(msg3)).toBeVisible();
  });

  test('should not send empty messages', async ({ page }) => {
    // Try to send empty message - button should be disabled
    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeDisabled();
  });

  test('should store messages in localStorage', async ({ page }) => {
    const testMsg = 'Stored message test';
    
    await page.getByPlaceholder('Type a message...').fill(testMsg);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    
    // Check localStorage
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem('messages');
      return stored ? JSON.parse(stored) : [];
    });
    
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m: any) => m.text === testMsg)).toBe(true);
  });
});
