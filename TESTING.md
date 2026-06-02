# Testing Documentation

## Overview

This Frappe AI Assistant project has a comprehensive testing architecture using:

- **pytest** for backend API testing
- **Playwright** for frontend/E2E testing
- **Visual regression testing** with screenshots
- **Mocked external APIs** for reliable tests

## Quick Start

### Running All Tests

```bash
cd /home/fonka/project-frappe/workspace/frappe-bench/apps/ai_assistant
./run-tests.sh
```

### Running Specific Test Suites

```bash
# Backend tests only
./run-tests.sh backend

# Frontend tests only
./run-tests.sh frontend

# Unit tests only
./run-tests.sh unit

# Integration tests only
./run-tests.sh integration

# Watch mode (Playwright)
./run-tests.sh watch

# View last test report
./run-tests.sh report
```

## Backend Testing (pytest)

### Setup

Tests are located in `ai_assistant/tests/`:

- `unit/` - Unit tests for internal functions
- `integration/` - Integration tests with mocked external APIs

### Running Backend Tests

```bash
cd /home/fonka/project-frappe/workspace/frappe-bench/apps/ai_assistant

# Run all backend tests
python -m pytest ai_assistant/tests/ -v

# Run specific test file
python -m pytest ai_assistant/tests/unit/test_ai_chat_api.py -v

# Run specific test class
python -m pytest ai_assistant/tests/unit/test_ai_chat_api.py::TestMockReasoningGeneration -v

# Run specific test
python -m pytest ai_assistant/tests/unit/test_ai_chat_api.py::TestMockReasoningGeneration::test_generates_reasoning_for_code_questions -v
```

### Backend Test Coverage

#### Unit Tests (`test_ai_chat_api.py`)

1. **Mock Reasoning Generation**
   - Generates appropriate reasoning for different question types
   - Handles edge cases (empty, special chars, unicode)
   - Provides content for responses without reasoning

2. **Response Formatting**
   - Error responses have correct structure
   - Success responses have required fields

3. **API Key Handling**
   - Missing API key error
   - Invalid API key error
   - Error messages are clear

4. **Response Parsing**
   - Standard OpenRouter responses
   - Responses with reasoning_content
   - Empty content handling

5. **Error Scenarios**
   - Timeout errors
   - Network errors
   - Malformed JSON
   - Rate limiting

6. **Edge Cases**
   - Very long messages
   - Special characters
   - Unicode handling
   - Empty messages

#### Integration Tests (`test_openrouter_integration.py`)

1. **OpenRouter API Integration**
   - Successful API calls with response parsing
   - Timeout handling
   - Connection errors
   - Invalid API key responses
   - Rate limit handling (429)
   - Model not found errors
   - Empty response content
   - Streaming responses
   - Multiple choices

2. **Response Format Variations**
   - Responses with function calls
   - Responses with citations

### Writing New Backend Tests

#### Example Unit Test

```python
import pytest
from ai_assistant.ai_chat_api import _generate_mock_reasoning

class TestNewFeature:
    @pytest.mark.unit
    def test_my_feature(self):
        """Test description"""
        result = _generate_mock_reasoning("test question")
        
        assert result is not None
        assert len(result) > 0
```

#### Example Integration Test

```python
import pytest
from unittest.mock import patch
import requests

class TestNewAPIFeature:
    @pytest.mark.integration
    def test_api_call_with_new_param(self):
        """Test new API parameter"""
        with patch('requests.post') as mock_post:
            mock_post.return_value.json.return_value = {"success": True}
            
            response = requests.post("https://api.example.com")
            assert response.json()["success"]
```

### Test Markers

Use these markers to categorize tests:

```python
@pytest.mark.unit          # Unit tests
@pytest.mark.integration   # Integration tests  
@pytest.mark.api          # API endpoint tests
@pytest.mark.slow         # Takes > 5 seconds
```

Run tests by marker:

```bash
pytest -m unit              # Only unit tests
pytest -m "not slow"        # Skip slow tests
pytest -m "unit or integration"  # Unit or integration
```

## Frontend Testing (Playwright)

### Setup

Frontend tests use Playwright and are in `tests/playwright/`:

- `tests/` - Test files (.spec.ts)
- `fixtures/` - Test fixtures and setup
- `helpers/` - UI helper functions
- `screenshots/` - Visual regression baselines

### Running Frontend Tests

```bash
cd /home/fonka/project-frappe/workspace/frappe-bench/apps/ai_assistant/tests/playwright

# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/page-load.spec.ts

# Run specific test
npx playwright test -g "should load the AI Chat page"

# Run in specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run on mobile
npx playwright test --project="Mobile Chrome"

# Watch mode (re-run on file change)
npx playwright test --watch

# Debug mode (opens inspector)
npx playwright test --debug

# Show UI
npx playwright test --ui
```

### Frontend Test Coverage

#### Page Load Tests (`page-load.spec.ts`)

- Page loads without 404
- Header displays
- All main sections (sidebar, chat, input) visible
- No console errors
- Proper page structure
- Styles load without errors
- Navigation works
- Page state persists after reload

#### Messaging Tests (`messaging.spec.ts`)

1. **Message Sending**
   - User can send messages
   - Messages display in correct bubble
   - Proper formatting in UI
   - Multiple messages in order
   - Long messages handled
   - Empty messages rejected

2. **Assistant Response**
   - Receives API response
   - Displays in assistant bubble
   - Shows typing indicator while waiting
   - Handles delays properly

3. **Message Formatting**
   - Special characters (emojis, unicode)
   - Code in messages
   - Markdown rendering

4. **Error Handling**
   - Shows error on API failure (502)
   - Shows error on missing API key
   - Allows retry after error
   - Error messages are clear

#### Persistence Tests (`persistence.spec.ts`)

- Conversations saved to localStorage
- State persists after reload
- Sidebar conversations list maintained
- Conversation ordering by last_updated
- Message order preserved
- localStorage can be cleared
- Corrupted data handled gracefully

### Writing New Frontend Tests

#### Example Playwright Test

```typescript
import { test, expect } from '../fixtures/chat.fixture';
import { sendMessage, waitForAssistantResponse } from '../helpers/ui-helpers';

test.describe('My Feature', () => {
  test('should do something', async ({ chatPage }) => {
    // chatPage is the fixture that loads the AI Chat page
    
    // Send a message
    await sendMessage(chatPage, 'Hello');
    
    // Wait for response
    await waitForAssistantResponse(chatPage);
    
    // Assert
    const lastMessage = chatPage.locator('.message.assistant:last-of-type');
    await expect(lastMessage).toBeVisible();
  });
});
```

#### Using Helper Functions

```typescript
import { getConversationList, selectConversation, copyMessage } from '../helpers/ui-helpers';

test('should work with helpers', async ({ chatPage }) => {
  // Get list of conversations
  const conversations = await getConversationList(chatPage);
  expect(conversations.length).toBeGreaterThan(0);
  
  // Select a conversation
  await selectConversation(chatPage, conversations[0]);
  
  // Copy a message
  await copyMessage(chatPage);
});
```

### Available Test Fixtures

```typescript
// From chat.fixture.ts
test.extend({
  chatPage,        // Page with AI Chat loaded
  withLocalStorage, // Pre-populate localStorage
  withMockedAPI    // Mock API responses
})
```

### Available UI Helpers

```typescript
sendMessage(page, message)           // Send a message
waitForAssistantResponse(page)       // Wait for response
getLatestMessageText(page)           // Get last message text
selectConversation(page, title)      // Click conversation
createNewConversation(page)          // Create new chat
deleteConversation(page, title)      // Delete with menu
renameConversation(page, old, new)   // Rename conversation
isThinkingProcessVisible(page)       // Check thinking shown
toggleThinkingProcess(page)          // Toggle thinking
copyMessage(page)                    // Click copy button
getConversationList(page)            // Get all conversation titles
hasMarkdownFormatting(page)          // Check for markdown
getLocalStorage(page, key)           // Read localStorage
clearLocalStorage(page)              // Clear all localStorage
getErrorMessage(page)                // Get error text if shown
```

## Visual Regression Testing

### Creating Baselines

```bash
cd tests/playwright

# Take initial screenshots
npx playwright test --update-snapshots

# This creates baseline screenshots in tests/*/
```

### Running Visual Tests

```bash
# Compare against baselines
npx playwright test

# Show visual differences in HTML report
npx playwright show-report
```

### Updating Snapshots

When you intentionally change the UI:

```bash
npx playwright test --update-snapshots
```

Then review the changes:

```bash
git diff tests/**/*.png
```

## CI/CD Integration

### GitHub Actions

Example `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install pytest pytest-cov requests
          cd tests/playwright && npm install
      
      - name: Run backend tests
        run: python -m pytest ai_assistant/tests/ -v
      
      - name: Run frontend tests
        run: cd tests/playwright && npx playwright test
      
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: tests/playwright/playwright-report/
```

## Troubleshooting

### Backend Tests

**pytest not found**
```bash
pip install pytest
```

**Import errors**
```bash
# Make sure you're in the correct directory
cd /home/fonka/project-frappe/workspace/frappe-bench

# Add apps to Python path
export PYTHONPATH="${PYTHONPATH}:apps/ai_assistant"
```

**Tests fail with "frappe not imported"**
```bash
# Run from bench directory
cd /home/fonka/project-frappe/workspace/frappe-bench
python -m pytest apps/ai_assistant/ai_assistant/tests/ -v
```

### Frontend Tests

**Playwright browsers not installed**
```bash
cd tests/playwright
npx playwright install
```

**Port 8000 already in use**
```bash
# Kill existing process
lsof -ti:8000 | xargs kill -9

# Or specify different port in playwright.config.ts
```

**Timeout errors**
```bash
# Increase timeout in test
await page.waitForSelector(selector, { timeout: 60000 });

# Or globally in playwright.config.ts
use: { navigationTimeout: 60000 }
```

**Tests pass locally but fail in CI**
```bash
# Use --headed to see browser
npx playwright test --headed

# Use --debug to step through
npx playwright test --debug

# Check screenshots
git diff tests/**/*.png
```

## Best Practices

1. **Test One Thing** - Each test should verify one behavior
2. **Clear Names** - Test names should describe what they test
3. **Use Fixtures** - Don't repeat setup code
4. **Mock External APIs** - Don't call real APIs in tests
5. **Check Assertions** - Always verify the expected outcome
6. **Handle Timeouts** - Use appropriate waits
7. **Keep Tests Fast** - Slow tests discourage running them
8. **Document Complex Tests** - Add comments for non-obvious logic

## Example Test Run Output

```
========================================
Running Backend Tests (pytest)
========================================

ai_assistant/tests/unit/test_ai_chat_api.py::TestMockReasoningGeneration::test_generates_reasoning_for_code_questions PASSED
ai_assistant/tests/unit/test_ai_chat_api.py::TestMockReasoningGeneration::test_generates_reasoning_for_math_questions PASSED
...

12 passed in 0.45s

✓ Unit tests passed

========================================
Running Frontend Tests (Playwright)
========================================

✓ 15 passed (23s)

✓ Playwright tests passed

========================================
Test Summary
========================================

✓ All tests passed!

Test Reports:
  - Pytest: See /tmp/unit-tests.log
  - Playwright: Open tests/playwright/playwright-report/index.html
```

## Next Steps

1. Add tests when fixing bugs
2. Add tests when implementing features
3. Run tests before committing
4. Set up CI/CD to auto-run tests
5. Review test failures to improve test quality
6. Keep tests updated as UI changes
