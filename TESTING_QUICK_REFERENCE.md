# Testing Quick Reference

## 🚀 Quick Start (60 seconds)

```bash
cd /home/fonka/project-frappe/workspace/frappe-bench/apps/ai_assistant

# Run all tests
./run-tests.sh all

# View report
./run-tests.sh report
```

## 📋 Common Commands

| Task | Command |
|------|---------|
| Run all tests | `./run-tests.sh all` |
| Run backend only | `./run-tests.sh backend` |
| Run frontend only | `./run-tests.sh frontend` |
| Unit tests | `./run-tests.sh unit` |
| Integration tests | `./run-tests.sh integration` |
| Watch mode | `./run-tests.sh watch` |
| View report | `./run-tests.sh report` |
| Debug tests | `cd tests/playwright && npx playwright test --debug` |
| Run specific test | `npx playwright test -g "test name"` |
| Update snapshots | `npx playwright test --update-snapshots` |

## 🎯 Backend Testing

### Run Tests
```bash
# All backend tests
python -m pytest ai_assistant/tests/ -v

# Unit tests only
python -m pytest ai_assistant/tests/unit/ -v

# Integration tests only
python -m pytest ai_assistant/tests/integration/ -v

# Specific test class
python -m pytest ai_assistant/tests/unit/test_ai_chat_api.py::TestMockReasoningGeneration -v

# Specific test
python -m pytest ai_assistant/tests/unit/test_ai_chat_api.py::TestMockReasoningGeneration::test_generates_reasoning_for_code_questions -v
```

### Test Markers
```bash
pytest -m unit              # Only unit tests
pytest -m integration       # Only integration tests
pytest -m "not slow"        # Skip slow tests
pytest --co -q              # List all tests
```

## 🎪 Frontend Testing

### Run Tests
```bash
cd tests/playwright

npx playwright test                    # All tests
npx playwright test -g "page load"     # Tests matching pattern
npx playwright test tests/messaging.spec.ts  # Specific file
npx playwright test --headed           # Run with browser visible
npx playwright test --debug            # Step through with debugger
npx playwright test --ui               # Visual UI mode
```

### Browsers
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project="Mobile Chrome"
```

### Report
```bash
npx playwright show-report             # Open HTML report
npx playwright test --trace=on         # Collect trace for debugging
```

## 📝 Helper Functions (Frontend)

```typescript
// Send a message
await sendMessage(page, "Hello");

// Wait for response
await waitForAssistantResponse(page);

// Get text
const text = await getLatestMessageText(page);

// Work with conversations
const convs = await getConversationList(page);
await selectConversation(page, "My Chat");
await createNewConversation(page);
await renameConversation(page, "Old", "New");
await deleteConversation(page, "My Chat");

// Reasoning process
const visible = await isThinkingProcessVisible(page);
await toggleThinkingProcess(page);

// Copy
await copyMessage(page);

// Data
const data = await getLocalStorage(page, "key");
await clearLocalStorage(page);

// Errors
const error = await getErrorMessage(page);
```

## 🐛 Debugging

### Debug Backend Tests
```bash
# Verbose output
pytest -vv

# Show print statements
pytest -s

# Traceback on failure
pytest -l

# Drop into debugger on failure
pytest --pdb

# Stop on first failure
pytest -x
```

### Debug Frontend Tests
```bash
# Step through with debugger
npx playwright test --debug

# Watch mode (re-run on file change)
npx playwright test --watch

# Visual UI
npx playwright test --ui

# Show browser
npx playwright test --headed

# Keep browser open on failure
npx playwright test --headed --headed
```

### View Logs
```bash
# After test run
cat /tmp/unit-tests.log
cat /tmp/integration-tests.log
cat /tmp/playwright-tests.log

# Real-time
tail -f /tmp/*.log
```

## ✅ Test Structure

### Backend Test
```python
import pytest

class TestFeature:
    @pytest.mark.unit
    def test_something(self):
        """Clear test description"""
        # Arrange
        input_value = "test"
        
        # Act
        result = function_under_test(input_value)
        
        # Assert
        assert result is not None
```

### Frontend Test
```typescript
test.describe('Feature', () => {
  test('should do something', async ({ chatPage }) => {
    // Setup
    await chatPage.goto('/desk/ai-chat');
    
    // Act
    await sendMessage(chatPage, 'test');
    await waitForAssistantResponse(chatPage);
    
    // Assert
    await expect(chatPage.locator('.message')).toContainText('test');
  });
});
```

## 📊 Test Results Interpretation

### ✅ All Passed
```
========================================
✓ All tests passed!
========================================
```
✓ Ready to commit
✓ No regressions detected
✓ All features working

### ❌ Some Failed
```
FAILED tests/messaging.spec.ts::should send message
```
1. Read error message
2. Check stack trace
3. Look at screenshot/video
4. Fix code
5. Re-run: `npx playwright test -g "should send message"`

### ⏱️ Timeout
```
Timeout after 30000ms
```
- Increase timeout: `test.setTimeout(60000)`
- Check if page loaded
- Verify element exists
- Check console for JS errors

## 🔍 Common Issues

| Issue | Solution |
|-------|----------|
| `Port 8000 already in use` | `lsof -ti:8000 \| xargs kill -9` |
| `Playwright not found` | `cd tests/playwright && npm install` |
| `Tests timeout` | Increase timeout in playwright.config.ts |
| `Import errors` | Run from `/bench` root directory |
| `Browser not installed` | `npx playwright install` |
| `Tests pass locally, fail in CI` | Use `--headed` to see browser |

## 📚 Documentation

- **Full Guide**: See `TESTING.md`
- **Summary**: See `TESTING_SUMMARY.md`
- **This**: `TESTING_QUICK_REFERENCE.md`

## 🎓 Examples

### Example: Add a test for new feature
```bash
# 1. Create feature in code
# 2. Create test
cat > tests/playwright/tests/new-feature.spec.ts << 'EOF'
import { test, expect } from '../fixtures/chat.fixture';

test('new feature works', async ({ chatPage }) => {
  // Your test here
});
EOF

# 3. Run test
npx playwright test tests/new-feature.spec.ts

# 4. Debug if needed
npx playwright test tests/new-feature.spec.ts --debug

# 5. Commit
git add .
git commit -m "feat: add new feature with tests"
```

### Example: Find and fix a failing test
```bash
# 1. Run tests
./run-tests.sh all

# 2. See the failure
# Tests: messaging.spec.ts - "should send message" FAILED

# 3. Run just that test
npx playwright test -g "should send message"

# 4. Open report to see screenshot
npx playwright show-report

# 5. Debug
npx playwright test -g "should send message" --debug

# 6. Fix the issue in code

# 7. Re-run
npx playwright test -g "should send message"
```

## 🚀 CI/CD Integration

### GitHub Actions
```bash
# Workflow runs tests on every push/PR
# Blocks merge if tests fail
# Publishes report as artifact
```

See TESTING.md for full workflow example.

### Manual CI
```bash
#!/bin/bash
./run-tests.sh all
if [ $? -eq 0 ]; then
  echo "Tests passed - safe to deploy"
  exit 0
else
  echo "Tests failed - do not deploy"
  exit 1
fi
```

## 💡 Pro Tips

1. **Run before commit**: `./run-tests.sh all`
2. **Use watch mode**: `npm run test:watch` while coding
3. **Debug failures**: `npx playwright test --debug`
4. **Understand timeout**: Increase if needed
5. **Check screenshots**: Always in failed test report
6. **Keep tests focused**: One assertion per test
7. **Use fixtures**: Don't repeat setup
8. **Mock APIs**: Always, never use real APIs
9. **Clear names**: Test names should describe behavior
10. **Keep fast**: Slow tests discourage running

## 📞 Need Help?

1. Check TESTING.md troubleshooting
2. Read test examples in tests/
3. Run test with --debug
4. Check /tmp/\*.log files
5. See Playwright docs: https://playwright.dev

---

**Happy Testing! 🎉**

Run `./run-tests.sh` now to verify everything works.
