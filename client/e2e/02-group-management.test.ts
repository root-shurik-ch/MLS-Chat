// Group Management E2E Tests
// Tests group creation and management flows

import { test, expect } from '@playwright/test';

test.describe('Group Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Register a test user first
    await page.getByPlaceholder('Display Name').fill('Group Test User');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForTimeout(500);
  });

  test('should display groups section', async ({ page }) => {
    // Should show groups section
    await expect(page.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
  });

  test('should allow creating a new group', async ({ page }) => {
    // Click create group button
    await page.getByRole('button', { name: 'Create Group' }).click();
    
    // Fill in group name
    await page.getByPlaceholder('Group Name').fill('Test Group');
    
    // Submit form
    await page.getByRole('button', { name: 'Create' }).click();
    
    // Wait for group to be created
    await page.waitForTimeout(500);
    
    // Verify group appears in list
    await expect(page.getByText('Test Group')).toBeVisible();
  });

  test('should not create group with empty name', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    
    // Should show cancel button still visible (form not submitted)
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should allow selecting a group to view chat', async ({ page }) => {
    // Create a group first
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Selectable Group');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    // Click on the group
    await page.getByText('Selectable Group').click();
    
    // Should show chat view
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('should generate unique group ID', async ({ page }) => {
    // Create first group
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Group A');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    const groups1 = await page.evaluate(() => localStorage.getItem('groups'));
    
    // Create second group
    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByPlaceholder('Group Name').fill('Group B');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);
    
    const groups2 = await page.evaluate(() => localStorage.getItem('groups'));
    
    // Groups should have different IDs
    const parsed1 = JSON.parse(groups1 || '[]');
    const parsed2 = JSON.parse(groups2 || '[]');
    
    expect(parsed1.length).toBe(1);
    expect(parsed2.length).toBe(2);
    expect(parsed2[0].groupId).not.toBe(parsed2[1].groupId);
  });
});
