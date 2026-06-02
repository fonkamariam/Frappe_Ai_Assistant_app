# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: page-load.spec.ts >> AI Chat - Navigation >> should maintain page state on reload
- Location: tests/page-load.spec.ts:81:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#chat-container')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#chat-container')

```

```yaml
- main:
  - img
  - heading "Login to Frappe" [level=4]
  - form:
    - text: Email
    - textbox "Email":
      - /placeholder: jane@example.com
    - img
    - text: Password
    - textbox "Password":
      - /placeholder: •••••
    - img
    - text: Show
    - paragraph:
      - link "Forgot Password?":
        - /url: "#forgot"
    - button "Login"
    - paragraph: or
    - link "Login with Email Link":
      - /url: "#login-with-email-link"
```

# Test source

```ts
  1  | import { test, expect } from '../fixtures/chat.fixture';
  2  | 
  3  | test.describe('AI Chat - Page Load', () => {
  4  |   test('should load the AI Chat page successfully', async ({ page }) => {
  5  |     await page.goto('/desk/ai-chat');
  6  |     
  7  |     // Page title should contain AI Chat
  8  |     expect(page.url()).toContain('/desk/ai-chat');
  9  |     
  10 |     // Main container should be visible
  11 |     await expect(page.locator('#chat-container')).toBeVisible();
  12 |   });
  13 | 
  14 |   test('should display page header', async ({ chatPage }) => {
  15 |     // Header should be visible
  16 |     await expect(chatPage.locator('.page-head, [role="heading"]')).toBeVisible();
  17 |   });
  18 | 
  19 |   test('should load all main sections', async ({ chatPage }) => {
  20 |     // Sidebar
  21 |     await expect(chatPage.locator('.sidebar')).toBeVisible();
  22 |     
  23 |     // Chat messages area
  24 |     await expect(chatPage.locator('#chat-messages, .chat-messages')).toBeVisible();
  25 |     
  26 |     // Input area
  27 |     await expect(chatPage.locator('textarea, input[type="text"]')).toBeVisible();
  28 |   });
  29 | 
  30 |   test('should not have console errors', async ({ page }) => {
  31 |     const errors: string[] = [];
  32 |     page.on('console', msg => {
  33 |       if (msg.type() === 'error') {
  34 |         errors.push(msg.text());
  35 |       }
  36 |     });
  37 |     
  38 |     await page.goto('/desk/ai-chat');
  39 |     await page.waitForTimeout(2000);
  40 |     
  41 |     // Filter out known non-critical errors
  42 |     const criticalErrors = errors.filter(e => !e.includes('Expected') && !e.includes('Warning'));
  43 |     expect(criticalErrors.length).toBe(0);
  44 |   });
  45 | 
  46 |   test('should have proper page structure', async ({ chatPage }) => {
  47 |     // Check for essential elements
  48 |     const docTitle = chatPage.locator('[data-doctype]');
  49 |     expect(await docTitle.count()).toBeGreaterThan(0);
  50 |   });
  51 | 
  52 |   test('should load styles without errors', async ({ page }) => {
  53 |     let styleLoadErrors = 0;
  54 |     page.on('response', response => {
  55 |       if (response.url().includes('.css') && !response.ok()) {
  56 |         styleLoadErrors++;
  57 |       }
  58 |     });
  59 |     
  60 |     await page.goto('/desk/ai-chat');
  61 |     await page.waitForLoadState('networkidle');
  62 |     
  63 |     expect(styleLoadErrors).toBe(0);
  64 |   });
  65 | });
  66 | 
  67 | test.describe('AI Chat - Navigation', () => {
  68 |   test('should navigate back to desk from AI Chat', async ({ page }) => {
  69 |     await page.goto('/desk/ai-chat');
  70 |     
  71 |     // Find navigation back button
  72 |     const backBtn = page.locator('[aria-label="Back"], .back-link');
  73 |     if (await backBtn.count() > 0) {
  74 |       await backBtn.click();
  75 |       // Should navigate away
  76 |       await page.waitForNavigation();
  77 |       expect(page.url()).not.toContain('/desk/ai-chat');
  78 |     }
  79 |   });
  80 | 
  81 |   test('should maintain page state on reload', async ({ page }) => {
  82 |     await page.goto('/desk/ai-chat');
  83 |     
  84 |     // Get initial state
  85 |     const firstLoad = page.locator('#chat-container');
> 86 |     await expect(firstLoad).toBeVisible();
     |                             ^ Error: expect(locator).toBeVisible() failed
  87 |     
  88 |     // Reload page
  89 |     await page.reload();
  90 |     
  91 |     // Should still be on AI Chat page
  92 |     expect(page.url()).toContain('/desk/ai-chat');
  93 |     
  94 |     // Main container should still be visible
  95 |     await expect(firstLoad).toBeVisible();
  96 |   });
  97 | });
  98 | 
```