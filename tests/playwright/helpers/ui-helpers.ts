import { Page, expect } from '@playwright/test';

/**
 * UI helper functions for AI Chat page testing
 */

/**
 * Send a message in the chat
 */
export async function sendMessage(page: Page, message: string) {
  const input = page.locator('textarea[placeholder*="Ask"], input[placeholder*="Type"]');
  await input.fill(message);
  
  const sendButton = page.locator('button:has-text("Send"), [data-action="send"]');
  await sendButton.click();
}

/**
 * Wait for assistant response to appear
 */
export async function waitForAssistantResponse(page: Page, timeout = 30000) {
  // Wait for the last message to be from assistant
  await page.waitForSelector('.message.assistant:last-of-type', { timeout });
}

/**
 * Get the latest message text
 */
export async function getLatestMessageText(page: Page): Promise<string> {
  const lastMessage = page.locator('.message:last-of-type .bubble');
  return await lastMessage.innerText();
}

/**
 * Click on a conversation in the sidebar
 */
export async function selectConversation(page: Page, title: string) {
  const conversation = page.locator(`.conversation-item:has-text("${title}")`);
  await conversation.click();
}

/**
 * Create a new conversation
 */
export async function createNewConversation(page: Page) {
  const newChatBtn = page.locator('button:has-text("New Chat"), [data-action="new-chat"]');
  await newChatBtn.click();
  
  // Wait for chat to be cleared
  await page.waitForTimeout(500);
}

/**
 * Delete a conversation using the menu
 */
export async function deleteConversation(page: Page, title: string) {
  const conversation = page.locator(`.conversation-item:has-text("${title}")`);
  
  // Hover to show menu
  await conversation.hover();
  
  // Click the three-dot menu
  const menu = conversation.locator('[data-action="menu"]');
  await menu.click();
  
  // Click delete
  const deleteBtn = page.locator('button:has-text("Delete")');
  await deleteBtn.click();
  
  // Confirm deletion
  const confirmBtn = page.locator('button:has-text("Yes"), button:has-text("Delete")');
  await confirmBtn.click();
}

/**
 * Rename a conversation
 */
export async function renameConversation(page: Page, oldTitle: string, newTitle: string) {
  const conversation = page.locator(`.conversation-item:has-text("${oldTitle}")`);
  await conversation.hover();
  
  const menu = conversation.locator('[data-action="menu"]');
  await menu.click();
  
  const renameBtn = page.locator('button:has-text("Rename")');
  await renameBtn.click();
  
  const input = page.locator('input[placeholder*="Name"]');
  await input.clear();
  await input.fill(newTitle);
  
  const saveBtn = page.locator('button:has-text("Save"), button:has-text("Rename")');
  await saveBtn.click();
}

/**
 * Check if thinking process is visible
 */
export async function isThinkingProcessVisible(page: Page): Promise<boolean> {
  const thinkingBlock = page.locator('.reasoning-block:visible');
  return await thinkingBlock.count() > 0;
}

/**
 * Toggle the thinking process visibility
 */
export async function toggleThinkingProcess(page: Page) {
  const toggle = page.locator('.reasoning-toggle');
  await toggle.click();
}

/**
 * Copy message text (click copy button)
 */
export async function copyMessage(page: Page) {
  const copyBtn = page.locator('.copy-msg-btn');
  await copyBtn.click();
  
  // Wait for confirmation (button shows "Copied!")
  await expect(copyBtn).toContainText('Copied');
}

/**
 * Get conversation list
 */
export async function getConversationList(page: Page): Promise<string[]> {
  const conversations = page.locator('.conversation-item');
  const count = await conversations.count();
  const titles: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const text = await conversations.nth(i).innerText();
    titles.push(text.split('\n')[0]);
  }
  
  return titles;
}

/**
 * Check if message is properly markdown rendered
 */
export async function hasMarkdownFormatting(page: Page): Promise<boolean> {
  const codeBlock = page.locator('.bubble pre, .bubble code');
  const boldText = page.locator('.bubble strong');
  const link = page.locator('.bubble a');
  
  return await codeBlock.count() > 0 || await boldText.count() > 0 || await link.count() > 0;
}

/**
 * Wait for typing indicator to appear and disappear
 */
export async function waitForTypingIndicator(page: Page) {
  // Wait for typing dots to appear
  await page.waitForSelector('.typing-indicator, .thinking-dots', { timeout: 5000 });
  
  // Wait for typing dots to disappear
  await page.waitForFunction(
    () => !document.querySelector('.typing-indicator, .thinking-dots') ||
           getComputedStyle(document.querySelector('.typing-indicator, .thinking-dots')).display === 'none',
    { timeout: 30000 }
  );
}

/**
 * Get localStorage data
 */
export async function getLocalStorage(page: Page, key: string): Promise<any> {
  return await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), key);
}

/**
 * Clear all localStorage
 */
export async function clearLocalStorage(page: Page) {
  await page.evaluate(() => localStorage.clear());
}

/**
 * Get error message if displayed
 */
export async function getErrorMessage(page: Page): Promise<string | null> {
  const errorMsg = page.locator('.error-message, [role="alert"], .alert-danger');
  if (await errorMsg.count() > 0) {
    return await errorMsg.first().innerText();
  }
  return null;
}
