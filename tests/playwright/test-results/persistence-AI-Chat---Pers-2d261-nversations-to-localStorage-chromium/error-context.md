# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.ts >> AI Chat - Persistence >> should save conversations to localStorage
- Location: tests/persistence.spec.ts:5:7

# Error details

```
Error: Channel closed
```

```
Error: page.waitForSelector: Test ended.
Call log:
  - waiting for locator('#chat-messages') to be visible

```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e7]:
    - generic [ref=e8]:
      - img [ref=e9]
      - heading "Login to Frappe" [level=4] [ref=e10]
    - form [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]:
            - generic [ref=e16]: Email
            - generic [ref=e17]:
              - textbox "Email" [active] [ref=e18]:
                - /placeholder: jane@example.com
              - img [ref=e19]
          - generic [ref=e21]:
            - generic [ref=e22]: Password
            - generic [ref=e23]:
              - textbox "Password" [ref=e24]:
                - /placeholder: •••••
              - img [ref=e25]
              - generic [ref=e27] [cursor=pointer]: Show
          - paragraph [ref=e28]:
            - link "Forgot Password?" [ref=e29] [cursor=pointer]:
              - /url: "#forgot"
        - button "Login" [ref=e31] [cursor=pointer]
        - generic [ref=e32]:
          - paragraph [ref=e33]: or
          - link "Login with Email Link" [ref=e36] [cursor=pointer]:
            - /url: "#login-with-email-link"
```

# Test source

```ts
  1   | import { test, expect } from '../fixtures/chat.fixture';
  2   | import { getLocalStorage, clearLocalStorage } from '../helpers/ui-helpers';
  3   | 
  4   | test.describe('AI Chat - Persistence', () => {
  5   |   test('should save conversations to localStorage', async ({ page }) => {
  6   |     await page.goto('/desk/ai-chat');
  7   |     
  8   |     // Wait for page to load
> 9   |     await page.waitForSelector('#chat-messages', { timeout: 10000 });
      |                ^ Error: page.waitForSelector: Test ended.
  10  |     
  11  |     // Get initial conversations count
  12  |     const before = await getLocalStorage(page, 'ai_chat_conversations');
  13  |     const initialCount = Array.isArray(before) ? before.length : 0;
  14  |     
  15  |     // Send a message
  16  |     const input = page.locator('textarea, input[type="text"]');
  17  |     await input.fill('Test message');
  18  |     const sendBtn = page.locator('button:has-text("Send")');
  19  |     await sendBtn.click();
  20  |     
  21  |     await page.waitForTimeout(1000);
  22  |     
  23  |     // Check localStorage was updated
  24  |     const after = await getLocalStorage(page, 'ai_chat_conversations');
  25  |     expect(Array.isArray(after)).toBe(true);
  26  |   });
  27  | 
  28  |   test('should persist conversations after page reload', async ({ page }) => {
  29  |     await page.goto('/desk/ai-chat');
  30  |     await page.waitForSelector('#chat-messages');
  31  |     
  32  |     // Send a message
  33  |     const input = page.locator('textarea, input[type="text"]');
  34  |     await input.fill('Persistent message');
  35  |     const sendBtn = page.locator('button:has-text("Send")');
  36  |     await sendBtn.click();
  37  |     
  38  |     const messagesBefore = await page.locator('.message').count();
  39  |     
  40  |     // Reload page
  41  |     await page.reload();
  42  |     await page.waitForSelector('#chat-messages');
  43  |     
  44  |     // Messages should still be there
  45  |     const messagesAfter = await page.locator('.message').count();
  46  |     expect(messagesAfter).toBeGreaterThanOrEqual(messagesBefore);
  47  |   });
  48  | 
  49  |   test('should restore conversation state from localStorage', async ({ page }) => {
  50  |     // Pre-populate localStorage
  51  |     await page.addInitScript(() => {
  52  |       const testConv = {
  53  |         id: 'test-conv-123',
  54  |         title: 'Test Conversation',
  55  |         messages: [
  56  |           { role: 'user', content: 'Hello' },
  57  |           { role: 'assistant', content: 'Hi there!' }
  58  |         ],
  59  |         created_at: new Date().toISOString(),
  60  |         last_updated: new Date().toISOString()
  61  |       };
  62  |       localStorage.setItem('ai_chat_conversations', JSON.stringify([testConv]));
  63  |     });
  64  |     
  65  |     await page.goto('/desk/ai-chat');
  66  |     await page.waitForSelector('#chat-messages');
  67  |     
  68  |     // Check if conversation was restored
  69  |     await page.waitForTimeout(1000);
  70  |     const messages = await page.locator('.message').count();
  71  |     expect(messages).toBeGreaterThan(0);
  72  |   });
  73  | 
  74  |   test('should maintain conversation list in sidebar', async ({ page }) => {
  75  |     await page.goto('/desk/ai-chat');
  76  |     await page.waitForSelector('.sidebar');
  77  |     
  78  |     // Get conversation count
  79  |     const convCount = await page.locator('.conversation-item').count();
  80  |     
  81  |     // Reload page
  82  |     await page.reload();
  83  |     await page.waitForSelector('.sidebar');
  84  |     
  85  |     // Conversation count should be the same
  86  |     const convCountAfter = await page.locator('.conversation-item').count();
  87  |     expect(convCountAfter).toEqual(convCount);
  88  |   });
  89  | 
  90  |   test('should update last_updated timestamp for active conversation', async ({ page }) => {
  91  |     await page.goto('/desk/ai-chat');
  92  |     await page.waitForSelector('#chat-messages');
  93  |     
  94  |     // Get timestamp before sending message
  95  |     let conversations = await getLocalStorage(page, 'ai_chat_conversations');
  96  |     const firstConv = Array.isArray(conversations) ? conversations[0] : null;
  97  |     const timestampBefore = firstConv?.last_updated;
  98  |     
  99  |     await page.waitForTimeout(1000);
  100 |     
  101 |     // Send a message
  102 |     const input = page.locator('textarea, input[type="text"]');
  103 |     await input.fill('New message');
  104 |     const sendBtn = page.locator('button:has-text("Send")');
  105 |     await sendBtn.click();
  106 |     
  107 |     await page.waitForTimeout(500);
  108 |     
  109 |     // Get timestamp after
```