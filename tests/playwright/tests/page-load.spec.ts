import { test, expect } from '../fixtures/chat.fixture';

test.describe('AI Chat - Page Load', () => {
  test('should load the AI Chat page successfully', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    
    // Page title should contain AI Chat
    expect(page.url()).toContain('/desk/ai-chat');
    
    // Main container should be visible
    await expect(page.locator('#chat-container')).toBeVisible();
  });

  test('should display page header', async ({ chatPage }) => {
    // Header should be visible
    await expect(chatPage.locator('.page-head, [role="heading"]')).toBeVisible();
  });

  test('should load all main sections', async ({ chatPage }) => {
    // Sidebar
    await expect(chatPage.locator('.sidebar')).toBeVisible();
    
    // Chat messages area
    await expect(chatPage.locator('#chat-messages, .chat-messages')).toBeVisible();
    
    // Input area
    await expect(chatPage.locator('textarea, input[type="text"]')).toBeVisible();
  });

  test('should not have console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/desk/ai-chat');
    await page.waitForTimeout(2000);
    
    // Filter out known non-critical errors
    const criticalErrors = errors.filter(e => !e.includes('Expected') && !e.includes('Warning'));
    expect(criticalErrors.length).toBe(0);
  });

  test('should have proper page structure', async ({ chatPage }) => {
    // Check for essential elements
    const docTitle = chatPage.locator('[data-doctype]');
    expect(await docTitle.count()).toBeGreaterThan(0);
  });

  test('should load styles without errors', async ({ page }) => {
    let styleLoadErrors = 0;
    page.on('response', response => {
      if (response.url().includes('.css') && !response.ok()) {
        styleLoadErrors++;
      }
    });
    
    await page.goto('/desk/ai-chat');
    await page.waitForLoadState('networkidle');
    
    expect(styleLoadErrors).toBe(0);
  });
});

test.describe('AI Chat - Navigation', () => {
  test('should navigate back to desk from AI Chat', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    
    // Find navigation back button
    const backBtn = page.locator('[aria-label="Back"], .back-link');
    if (await backBtn.count() > 0) {
      await backBtn.click();
      // Should navigate away
      await page.waitForNavigation();
      expect(page.url()).not.toContain('/desk/ai-chat');
    }
  });

  test('should maintain page state on reload', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    
    // Get initial state
    const firstLoad = page.locator('#chat-container');
    await expect(firstLoad).toBeVisible();
    
    // Reload page
    await page.reload();
    
    // Should still be on AI Chat page
    expect(page.url()).toContain('/desk/ai-chat');
    
    // Main container should still be visible
    await expect(firstLoad).toBeVisible();
  });
});
