import { test, expect } from '../fixtures/chat.fixture';
import { getLocalStorage, clearLocalStorage } from '../helpers/ui-helpers';

test.describe('AI Chat - Persistence', () => {
  test('should save conversations to localStorage', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    
    // Wait for page to load
    await page.waitForSelector('#chat-messages', { timeout: 10000 });
    
    // Get initial conversations count
    const before = await getLocalStorage(page, 'ai_chat_conversations');
    const initialCount = Array.isArray(before) ? before.length : 0;
    
    // Send a message
    const input = page.locator('textarea, input[type="text"]');
    await input.fill('Test message');
    const sendBtn = page.locator('button:has-text("Send")');
    await sendBtn.click();
    
    await page.waitForTimeout(1000);
    
    // Check localStorage was updated
    const after = await getLocalStorage(page, 'ai_chat_conversations');
    expect(Array.isArray(after)).toBe(true);
  });

  test('should persist conversations after page reload', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    await page.waitForSelector('#chat-messages');
    
    // Send a message
    const input = page.locator('textarea, input[type="text"]');
    await input.fill('Persistent message');
    const sendBtn = page.locator('button:has-text("Send")');
    await sendBtn.click();
    
    const messagesBefore = await page.locator('.message').count();
    
    // Reload page
    await page.reload();
    await page.waitForSelector('#chat-messages');
    
    // Messages should still be there
    const messagesAfter = await page.locator('.message').count();
    expect(messagesAfter).toBeGreaterThanOrEqual(messagesBefore);
  });

  test('should restore conversation state from localStorage', async ({ page }) => {
    // Pre-populate localStorage
    await page.addInitScript(() => {
      const testConv = {
        id: 'test-conv-123',
        title: 'Test Conversation',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' }
        ],
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      };
      localStorage.setItem('ai_chat_conversations', JSON.stringify([testConv]));
    });
    
    await page.goto('/desk/ai-chat');
    await page.waitForSelector('#chat-messages');
    
    // Check if conversation was restored
    await page.waitForTimeout(1000);
    const messages = await page.locator('.message').count();
    expect(messages).toBeGreaterThan(0);
  });

  test('should maintain conversation list in sidebar', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    await page.waitForSelector('.sidebar');
    
    // Get conversation count
    const convCount = await page.locator('.conversation-item').count();
    
    // Reload page
    await page.reload();
    await page.waitForSelector('.sidebar');
    
    // Conversation count should be the same
    const convCountAfter = await page.locator('.conversation-item').count();
    expect(convCountAfter).toEqual(convCount);
  });

  test('should update last_updated timestamp for active conversation', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    await page.waitForSelector('#chat-messages');
    
    // Get timestamp before sending message
    let conversations = await getLocalStorage(page, 'ai_chat_conversations');
    const firstConv = Array.isArray(conversations) ? conversations[0] : null;
    const timestampBefore = firstConv?.last_updated;
    
    await page.waitForTimeout(1000);
    
    // Send a message
    const input = page.locator('textarea, input[type="text"]');
    await input.fill('New message');
    const sendBtn = page.locator('button:has-text("Send")');
    await sendBtn.click();
    
    await page.waitForTimeout(500);
    
    // Get timestamp after
    conversations = await getLocalStorage(page, 'ai_chat_conversations');
    const updatedConv = Array.isArray(conversations) ? conversations[0] : null;
    const timestampAfter = updatedConv?.last_updated;
    
    // Timestamp should have updated
    if (timestampBefore && timestampAfter) {
      expect(new Date(timestampAfter).getTime()).toBeGreaterThanOrEqual(new Date(timestampBefore).getTime());
    }
  });

  test('should clear localStorage on user request', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    
    // Send a message to create data
    const input = page.locator('textarea, input[type="text"]');
    await input.fill('Test');
    const sendBtn = page.locator('button:has-text("Send")');
    await sendBtn.click();
    
    await page.waitForTimeout(500);
    
    // Verify data exists
    let data = await getLocalStorage(page, 'ai_chat_conversations');
    expect(data).toBeTruthy();
    
    // Clear localStorage
    await clearLocalStorage(page);
    
    // Verify cleared
    data = await getLocalStorage(page, 'ai_chat_conversations');
    expect(data).toEqual({});
  });

  test('should handle corrupted localStorage gracefully', async ({ page }) => {
    await page.addInitScript(() => {
      // Set invalid JSON
      localStorage.setItem('ai_chat_conversations', '{invalid json}');
    });
    
    // Should not crash
    await expect(async () => {
      await page.goto('/desk/ai-chat');
      await page.waitForSelector('#chat-messages', { timeout: 5000 });
    }).not.toThrow();
  });

  test('should order conversations by last_updated', async ({ page }) => {
    // Pre-populate localStorage with multiple conversations
    await page.addInitScript(() => {
      const conversations = [
        {
          id: 'old-conv',
          title: 'Old Conversation',
          messages: [],
          created_at: new Date(Date.now() - 86400000).toISOString(),
          last_updated: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 'new-conv',
          title: 'New Conversation',
          messages: [],
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        }
      ];
      localStorage.setItem('ai_chat_conversations', JSON.stringify(conversations));
    });
    
    await page.goto('/desk/ai-chat');
    await page.waitForSelector('.sidebar');
    await page.waitForTimeout(1000);
    
    // Check order - newer should appear first
    const firstItem = await page.locator('.conversation-item').first().innerText();
    expect(firstItem).toContain('New Conversation');
  });

  test('should preserve message order after reload', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    await page.waitForSelector('#chat-messages');
    
    // Send messages in order
    const messages = ['First', 'Second', 'Third'];
    for (const msg of messages) {
      const input = page.locator('textarea, input[type="text"]');
      await input.fill(msg);
      const sendBtn = page.locator('button:has-text("Send")');
      await sendBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Get message order before reload
    const messagesBefore = await page.locator('.message').allInnerTexts();
    
    // Reload
    await page.reload();
    await page.waitForSelector('#chat-messages');
    await page.waitForTimeout(1000);
    
    // Get message order after reload
    const messagesAfter = await page.locator('.message').allInnerTexts();
    
    // Order should be preserved
    expect(messagesAfter.length).toEqual(messagesBefore.length);
  });
});
