import { test as base, expect } from '@playwright/test';

/**
 * Chat page fixture - provides common setup for AI chat page tests
 */
export const test = base.extend({
  /**
   * Navigate to AI chat page and wait for it to load
   */
  chatPage: async ({ page }, use) => {
    await page.goto('/desk/ai-chat');
    
    // Wait for main chat container to be visible
    await page.waitForSelector('#chat-container', { timeout: 10000 });
    
    // Wait for sidebar to render
    await page.waitForSelector('.sidebar', { timeout: 5000 });
    
    await use(page);
  },

  /**
   * Mock localStorage with initial state
   */
  withLocalStorage: async ({ page }, use) => {
    await page.addInitScript(() => {
      // Pre-populate localStorage with test data if needed
      const testConversations = [
        {
          id: 'test-conv-1',
          title: 'Test Conversation 1',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' }
          ],
          created_at: new Date(Date.now() - 86400000).toISOString(),
          last_updated: new Date(Date.now() - 86400000).toISOString()
        }
      ];
      localStorage.setItem('ai_chat_conversations', JSON.stringify(testConversations));
    });
    
    await use(page);
  },

  /**
   * Mock OpenRouter API responses
   */
  withMockedAPI: async ({ page }, use) => {
    await page.route('**/api/method/ai_assistant*', route => {
      const request = route.request();
      
      if (request.postDataJSON?.args?.message) {
        route.abort('blockedbyclient');
      } else {
        route.continue();
      }
    });
    
    await use(page);
  }
});

export { expect };
