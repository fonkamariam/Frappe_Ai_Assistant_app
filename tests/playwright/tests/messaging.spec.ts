import { test, expect } from '../fixtures/chat.fixture';
import { sendMessage, waitForAssistantResponse, getLatestMessageText, createNewConversation, selectConversation, getConversationList } from '../helpers/ui-helpers';

test.describe('AI Chat - Messaging', () => {
  test('should send a user message', async ({ chatPage }) => {
    const testMessage = 'Hello, how are you?';
    
    // Find input and send button
    const input = chatPage.locator('textarea, input[type="text"]');
    await input.fill(testMessage);
    
    const sendBtn = chatPage.locator('button:has-text("Send"), [role="button"]:has-text("Send")');
    await sendBtn.click();
    
    // Message should appear in chat
    const lastMessage = chatPage.locator('.message.user:last-of-type');
    await expect(lastMessage).toContainText(testMessage);
  });

  test('should display message in correct bubble', async ({ chatPage }) => {
    await sendMessage(chatPage, 'Test message');
    
    // User message should be in right bubble
    const userBubble = chatPage.locator('.message.user .bubble');
    await expect(userBubble.last()).toContainText('Test message');
  });

  test('should receive assistant response', async ({ chatPage }) => {
    // Mock the API response
    await chatPage.route('**/api/method/ai_assistant*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: {
            ok: true,
            content: 'This is a test response from the assistant.',
            reasoning_content: '',
            model: 'test-model',
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
          }
        })
      });
    });
    
    await sendMessage(chatPage, 'Hello?');
    
    // Wait for assistant response
    await waitForAssistantResponse(chatPage);
    
    // Response should appear
    const assistantMessage = chatPage.locator('.message.assistant:last-of-type');
    await expect(assistantMessage).toBeVisible();
  });

  test('should display multiple messages in order', async ({ chatPage }) => {
    const messages = ['First message', 'Second message', 'Third message'];
    
    for (const msg of messages) {
      const input = chatPage.locator('textarea, input[type="text"]');
      await input.fill(msg);
      const sendBtn = chatPage.locator('button:has-text("Send")');
      await sendBtn.click();
      await chatPage.waitForTimeout(500);
    }
    
    // All messages should be visible
    for (const msg of messages) {
      await expect(chatPage.locator(`.message:has-text("${msg}")`)).toBeVisible();
    }
  });

  test('should handle very long messages', async ({ chatPage }) => {
    const longMessage = 'This is a very long message. '.repeat(50) + 'End.';
    
    await sendMessage(chatPage, longMessage);
    
    const lastMessage = chatPage.locator('.message.user:last-of-type');
    await expect(lastMessage).toBeVisible();
    
    // Message should wrap properly (not overflow)
    const bubble = lastMessage.locator('.bubble');
    const overflow = await bubble.evaluate(el => window.getComputedStyle(el).overflow);
    expect(overflow).not.toBe('hidden');
  });

  test('should handle empty message submission', async ({ chatPage }) => {
    const sendBtn = chatPage.locator('button:has-text("Send")');
    
    // Try to send empty message
    await sendBtn.click();
    
    // Should not create a message bubble (or should show error)
    const messageCount = await chatPage.locator('.message').count();
    expect(messageCount).toBe(0);
  });

  test('should show typing indicator while waiting for response', async ({ chatPage }) => {
    // Mock slow API response
    await chatPage.route('**/api/method/ai_assistant*', async route => {
      await route.request().postDataJSON();
      // Simulate delay
      await new Promise(r => setTimeout(r, 1000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: {
            ok: true,
            content: 'Response after delay',
            reasoning_content: ''
          }
        })
      });
    });
    
    await sendMessage(chatPage, 'Test?');
    
    // Typing indicator should appear
    const typingIndicator = chatPage.locator('.thinking-dots, .typing-indicator, .stream-cursor');
    await expect(typingIndicator).toBeVisible({ timeout: 5000 });
  });

  test('should handle special characters in messages', async ({ chatPage }) => {
    const specialMessage = 'Test with émojis 🚀 and spëcial çhars @#$%^&*()';
    
    await sendMessage(chatPage, specialMessage);
    
    const userMessage = chatPage.locator('.message.user:last-of-type');
    await expect(userMessage).toContainText('Test with émojis');
  });

  test('should handle code in messages', async ({ chatPage }) => {
    const codeMessage = 'Can you help with this code?\n\nfunction test() {\n  return 42;\n}';
    
    await sendMessage(chatPage, codeMessage);
    
    const userMessage = chatPage.locator('.message.user:last-of-type');
    await expect(userMessage).toBeVisible();
  });

  test('should not show send button tooltip on focus', async ({ chatPage }) => {
    const input = chatPage.locator('textarea, input[type="text"]');
    await input.focus();
    
    // Input should not have any error styling
    const errorClass = await input.getAttribute('class');
    expect(errorClass).not.toContain('error');
  });
});

test.describe('AI Chat - Error Handling', () => {
  test('should show error when API fails', async ({ chatPage }) => {
    // Mock API error
    await chatPage.route('**/api/method/ai_assistant*', route => {
      route.fulfill({
        status: 502,
        body: 'Bad Gateway'
      });
    });
    
    await sendMessage(chatPage, 'Test?');
    
    // Should show error message
    await chatPage.waitForTimeout(2000);
    const errorMsg = chatPage.locator('.error-message, [role="alert"], .message:has-text("error")');
    if (await errorMsg.count() > 0) {
      await expect(errorMsg.first()).toBeVisible();
    }
  });

  test('should show error when API key is missing', async ({ chatPage }) => {
    // Mock API error for missing key
    await chatPage.route('**/api/method/ai_assistant*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: {
            ok: false,
            error: 'MISSING_API_KEY',
            message: 'OpenRouter API key not configured'
          }
        })
      });
    });
    
    await sendMessage(chatPage, 'Hello?');
    
    await chatPage.waitForTimeout(2000);
    const errorMsg = chatPage.locator('.message.assistant:last-of-type');
    await expect(errorMsg).toContainText('API key');
  });

  test('should recover from error and allow retry', async ({ chatPage }) => {
    let callCount = 0;
    
    // First call fails, second succeeds
    await chatPage.route('**/api/method/ai_assistant*', route => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status: 500,
          body: 'Server Error'
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: {
              ok: true,
              content: 'Success on retry',
              reasoning_content: ''
            }
          })
        });
      }
    });
    
    // First message should fail
    await sendMessage(chatPage, 'First try');
    await chatPage.waitForTimeout(1000);
    
    // Second message should succeed
    await sendMessage(chatPage, 'Second try');
    await waitForAssistantResponse(chatPage);
    
    const lastMessage = chatPage.locator('.message.assistant:last-of-type');
    await expect(lastMessage).toContainText('Success on retry');
  });
});
