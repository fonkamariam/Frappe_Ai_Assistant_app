# 🚀 Quick Start - Running Tests in Docker

## Overview

Tests work best when **Frappe bench is running** in one terminal/container, and you run tests from another.

---

## Step 1: Start Frappe Bench

In **Terminal 1** (or first container terminal):

```bash
bench start
```

Wait for it to show:
```
web.1      | Running on http://127.0.0.1:8000
```

---

## Step 2: Run Frontend Tests

In **Terminal 2** (keep Terminal 1 running):

```bash
cd /home/frappe/frappe-bench/apps/ai_assistant

# First time only: Install browsers
./test-frontend.sh install

# Run all tests
./test-frontend.sh all
```

### Test Commands

```bash
# Run all tests
./test-frontend.sh all

# Debug mode (step through tests)
./test-frontend.sh debug

# Visual UI mode
./test-frontend.sh ui

# Watch mode (auto-rerun)
./test-frontend.sh watch

# View test report
./test-frontend.sh report

# Specific browser
./test-frontend.sh chromium   # Chrome only
./test-frontend.sh firefox    # Firefox only
./test-frontend.sh webkit     # Safari only

# Browser visible
./test-frontend.sh headed
```

---

## First Time Setup (5 minutes)

### Step 1: Install Playwright Browsers

```bash
cd /home/frappe/frappe-bench/apps/ai_assistant

./test-frontend.sh install
```

This downloads browsers (~500MB). Coffee time ☕

### Step 2: Start Bench (Terminal 1)

```bash
bench start
```

### Step 3: Run a Quick Test (Terminal 2)

```bash
cd /home/frappe/frappe-bench/apps/ai_assistant

./test-frontend.sh all
```

---

## Understanding Test Output

### ✅ Success
```
 15 passed (45s)

To open last HTML report run:
  npx playwright show-report

✓ Tests passed!
```

### ❌ Failures
Tests will show:
- Which test failed
- Screenshot of failure
- Error message
- Video of test

View with:
```bash
./test-frontend.sh report
```

### ⏱️ Timeout
If tests timeout, make sure:
1. Bench is running (`bench start` in Terminal 1)
2. You can access http://127.0.0.1:8000 in browser
3. No errors in bench logs

---

## Common Scenarios

### I just cloned the repo

```bash
cd /home/frappe/frappe-bench/apps/ai_assistant

# Install browsers (one time)
./test-frontend.sh install

# Then in Terminal 1:
bench start

# Then in Terminal 2:
./test-frontend.sh all
```

### I'm developing and want auto-rerun

```bash
./test-frontend.sh watch

# Tests auto-run as you edit files!
```

### A test failed and I need to debug

```bash
# Step through the test
./test-frontend.sh debug

# Or see the failure
./test-frontend.sh report
```

### I only want to test in one browser

```bash
./test-frontend.sh chromium    # Only Chrome
./test-frontend.sh firefox     # Only Firefox
./test-frontend.sh webkit      # Only Safari
```

### I want to see the browser while tests run

```bash
./test-frontend.sh headed

# Browser opens and you see it interact
```

---

## File Structure

```
/home/frappe/frappe-bench/apps/ai_assistant/
├── test-frontend.sh           ← Use this! ✨
├── tests/playwright/
│   ├── tests/
│   │   ├── page-load.spec.ts
│   │   ├── sidebar.spec.ts
│   │   ├── messaging.spec.ts
│   │   └── persistence.spec.ts
│   ├── fixtures/
│   ├── helpers/
│   ├── playwright.config.ts
│   └── package.json
├── TESTING.md                 ← Full documentation
└── TESTING_QUICK_REFERENCE.md ← Commands reference
```

---

## Troubleshooting

### Port 8000 in use

Kill the process:
```bash
lsof -ti:8000 | xargs kill -9
```

### Browser not installed

```bash
./test-frontend.sh install
```

### Tests timeout

Make sure:
1. Bench is running: `bench start`
2. Port 8000 is accessible
3. No firewall issues

### Can't run ./test-frontend.sh

Make it executable:
```bash
chmod +x ./test-frontend.sh
```

### npx not found

Install npm:
```bash
apt-get update && apt-get install -y npm
```

---

## What Tests Do

They verify:
- ✅ Page loads correctly
- ✅ Sidebar shows conversations
- ✅ Messages send and receive
- ✅ Typing indicators appear
- ✅ Error messages show
- ✅ Data persists after reload
- ✅ Copy buttons work
- ✅ And 40+ more scenarios!

---

## Reports & Debugging

### View detailed report
```bash
./test-frontend.sh report
```

Opens HTML report with:
- Screenshots of each test
- Video of failed tests
- Error messages
- Timing info

### Debug step-by-step
```bash
./test-frontend.sh debug
```

Opens Playwright Inspector:
- Step through code
- Inspect elements
- Pause on failures

---

## Quick Command Reference

| What | Command |
|------|---------|
| Run all tests | `./test-frontend.sh all` |
| Debug | `./test-frontend.sh debug` |
| Watch mode | `./test-frontend.sh watch` |
| See report | `./test-frontend.sh report` |
| Browser visible | `./test-frontend.sh headed` |
| Chromium only | `./test-frontend.sh chromium` |
| Install browsers | `./test-frontend.sh install` |

---

## Next Steps

1. ✅ Run `./test-frontend.sh install` (first time)
2. ✅ Start bench: `bench start` (Terminal 1)
3. ✅ Run tests: `./test-frontend.sh all` (Terminal 2)
4. ✅ Check report: `./test-frontend.sh report`

---

## Full Documentation

- **Quick Ref**: See `TESTING_QUICK_REFERENCE.md`
- **Full Guide**: See `TESTING.md`
- **Summary**: See `TESTING_SUMMARY.md`

**Happy Testing!** 🎉
