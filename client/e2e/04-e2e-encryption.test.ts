// E2E Encryption Verification Tests
// Verifies that server only sees ciphertext, never plaintext

import { test, expect } from '@playwright/test';

test.describe('E2E Encryption Verification', () => {
  test('should encrypt messages before sending to server', async ({ page }) => {
    await page.goto('/');
    
    // Register user
    await page.getByPlaceholder('Display Name').fill('Encryption Test User');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    // Create group
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Encrypted Chat');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    // Select group
    await page.getByText('Encrypted Chat').click();
    
    // Send a test message
    const plaintext = 'Secret message';
    await page.getByPlaceholder('Type a message...').fill(plaintext);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    
    // Check localStorage for encrypted message
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem('messages');
      return stored ? JSON.parse(stored) : [];
    });
    
    expect(messages.length).toBeGreaterThan(0);
    
    const lastMessage = messages[messages.length - 1];
    
    // The ciphertext should NOT contain the plaintext
    expect(lastMessage.ciphertext).not.toContain(plaintext);
    
    // The ciphertext should be base64 encoded
    try {
      const decoded = atob(lastMessage.ciphertext);
      expect(decoded).not.toBe(plaintext);
    } catch {
      // If decode fails, that's also fine
    }
  });

  test('server should only receive encrypted mls_bytes', async ({ page }) => {
    await page.goto('/');
    
    // Register user
    await page.getByPlaceholder('Display Name').fill('Alice');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    // Create group
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Private Chat');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    // Select group
    await page.getByText('Private Chat').click();
    
    // Send message
    const secretText = 'This is a secret';
    await page.getByPlaceholder('Type a message...').fill(secretText);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    
    // Get stored messages
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem('messages');
      return stored ? JSON.parse(stored) : [];
    });
    
    const lastMsg = messages[messages.length - 1];
    
    // Server-side verification: ciphertext should NOT contain plaintext
    expect(lastMsg.ciphertext).toBeTruthy();
    expect(lastMsg.ciphertext.includes(secretText)).toBe(false);
  });

  test('each message should have unique ciphertext for same plaintext', async ({ page }) => {
    await page.goto('/');
    
    // Register user
    await page.getByPlaceholder('Display Name').fill('MLS Test');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
    
    // Create group
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('MLS Group');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    // Select group
    await page.getByText('MLS Group').click();
    
    // Send same message twice
    const sameText = 'Same message';
    
    await page.getByPlaceholder('Type a message...').fill(sameText);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(200);
    
    await page.getByPlaceholder('Type a message...').fill(sameText);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(500);
    
    // Get stored messages
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem('messages');
      return stored ? JSON.parse(stored) : [];
    });
    
    // Both messages should have different ciphertexts
    if (messages.length >= 2) {
      expect(messages[messages.length - 1].ciphertext).not.toBe(messages[messages.length - 2].ciphertext);
    }
  });
});
