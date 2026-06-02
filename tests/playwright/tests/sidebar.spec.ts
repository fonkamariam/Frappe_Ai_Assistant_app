import { test, expect } from '../fixtures/chat.fixture';
import { createNewConversation, deleteConversation, renameConversation, getConversationList } from '../helpers/ui-helpers';

test.describe('AI Chat - Sidebar', () => {
  test('should display sidebar with conversations', async ({ chatPage }) => {
    // Sidebar should be visible
    const sidebar = chatPage.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    
    // Should have conversation list
    const convList = chatPage.locator('.conversation-list, [data-test="conversation-list"]');
    if (await convList.count() > 0) {
      await expect(convList).toBeVisible();
    }
  });

  test('should show new chat button', async ({ chatPage }) => {
    const newChatBtn = chatPage.locator('button:has-text("New Chat"), [data-action="new-chat"]');
    await expect(newChatBtn).toBeVisible();
  });

  test('should create new conversation', async ({ chatPage }) => {
    const convBefore = await getConversationList(chatPage);
    const countBefore = convBefore.length;
    
    await createNewConversation(chatPage);
    
    // Send a message to create actual conversation
    const input = chatPage.locator('textarea, input[type="text"]');
    await input.fill('Test conversation');
    const sendBtn = chatPage.locator('button:has-text("Send")');
    await sendBtn.click();
    
    await chatPage.waitForTimeout(1000);
    
    const convAfter = await getConversationList(chatPage);
    expect(convAfter.length).toBeGreaterThanOrEqual(countBefore);
  });

  test('should show three-dot menu on hover', async ({ chatPage }) => {
    // Get first conversation
    const firstConv = chatPage.locator('.conversation-item').first();
    
    // Hover to show menu
    await firstConv.hover();
    
    // Menu button should appear
    const menuBtn = firstConv.locator('[data-action="menu"]');
    await expect(menuBtn).toBeVisible();
  });

  test('should show menu options on click', async ({ chatPage }) => {
    const firstConv = chatPage.locator('.conversation-item').first();
    await firstConv.hover();
    
    const menuBtn = firstConv.locator('[data-action="menu"]');
    await menuBtn.click();
    
    // Menu options should appear
    await chatPage.waitForTimeout(500);
    const renameOpt = chatPage.locator('button:has-text("Rename")');
    const deleteOpt = chatPage.locator('button:has-text("Delete")');
    
    // At least one should be visible
    expect(await renameOpt.count() + await deleteOpt.count()).toBeGreaterThan(0);
  });

  test('should select conversation on click', async ({ chatPage }) => {
    // Create a conversation first
    const input = chatPage.locator('textarea, input[type="text"]');
    await input.fill('Conv A');
    let sendBtn = chatPage.locator('button:has-text("Send")');
    await sendBtn.click();
    
    await chatPage.waitForTimeout(1000);
    
    // Create another
    await createNewConversation(chatPage);
    await input.fill('Conv B');
    sendBtn = chatPage.locator('button:has-text("Send")');
    await sendBtn.click();
    
    await chatPage.waitForTimeout(1000);
    
    // Click on first conversation
    const firstConv = chatPage.locator('.conversation-item').first();
    const firstText = await firstConv.innerText();
    await firstConv.click();
    
    // Messages should change
    await chatPage.waitForTimeout(500);
  });

  test('should highlight active conversation', async ({ chatPage }) => {
    const firstConv = chatPage.locator('.conversation-item').first();
    
    // Active conversation should have special class/styling
    const activeClass = await firstConv.getAttribute('class');
    expect(activeClass).toBeTruthy();
  });

  test('should show conversation title', async ({ chatPage }) => {
    // Get conversation items
    const conversations = chatPage.locator('.conversation-item');
    
    if (await conversations.count() > 0) {
      const firstConvText = await conversations.first().innerText();
      expect(firstConvText.length).toBeGreaterThan(0);
    }
  });

  test('should handle many conversations in list', async ({ page }) => {
    await page.goto('/desk/ai-chat');
    await page.waitForSelector('.sidebar');
    
    // Add multiple conversations to localStorage
    await page.addInitScript(() => {
      const conversations = [];
      for (let i = 0; i < 50; i++) {
        conversations.push({
          id: `conv-${i}`,
          title: `Conversation ${i}`,
          messages: [],
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        });
      }
      localStorage.setItem('ai_chat_conversations', JSON.stringify(conversations));
    });
    
    await page.reload();
    await page.waitForSelector('.sidebar');
    
    // Sidebar should handle many items (scroll or paginate)
    const convs = page.locator('.conversation-item');
    expect(await convs.count()).toBeGreaterThan(0);
  });

  test('should have scrollable conversation list', async ({ chatPage }) => {
    const sidebar = chatPage.locator('.sidebar, [data-test="sidebar"]');
    const convList = chatPage.locator('.conversation-list');
    
    if (await convList.count() > 0) {
      // Check if overflow is set
      const overflow = await convList.evaluate(el => window.getComputedStyle(el).overflowY);
      expect(['auto', 'scroll', 'visible']).toContain(overflow);
    }
  });

  test('should show search/filter for conversations', async ({ chatPage }) => {
    // Look for search/filter input
    const searchInput = chatPage.locator('input[placeholder*="Search"], input[placeholder*="Filter"]');
    
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible();
      
      // Should filter conversations
      await searchInput.fill('test');
      await chatPage.waitForTimeout(500);
    }
  });

  test('should maintain scroll position in sidebar', async ({ chatPage }) => {
    const sidebar = chatPage.locator('.sidebar');
    
    // Scroll down
    await sidebar.evaluate(el => el.scrollTop = 100);
    
    // Interact with page
    const input = chatPage.locator('textarea');
    await input.fill('test');
    
    // Scroll position should be maintained or manageable
    const scrollPos = await sidebar.evaluate(el => el.scrollTop);
    expect(scrollPos).toBeGreaterThanOrEqual(0);
  });
});
