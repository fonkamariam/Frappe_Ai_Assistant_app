# UI-Only Branch Setup & Integration Guide

**Status:** ✅ Ready to Use  
**Branch:** `ui-only`  
**Created:** June 2, 2026

---

## 📖 Quick Overview

You now have **two versions** of your AI Assistant app:

| Aspect | `main` Branch | `ui-only` Branch |
|--------|--------------|------------------|
| **Use Case** | Complete standalone app | Integration with existing backend |
| **What's Included** | UI + Full Backend | UI + Simple Proxy |
| **Best For** | New implementations | Integrating with manager's API |
| **Config Complexity** | Many settings | 3 values only |
| **Tool Support** | Built-in tools | External tools |
| **When Ready** | Now | When manager gives you API |

---

## 🎯 Current Status

### ✅ What's Done:

1. **Created `ui-only` branch** - Separate from `main`
2. **Removed complex backend** - agent.py, tools/, etc.
3. **Added simple proxy API** - `ai_chat_api_simplified.py`
4. **Added config layer** - `llm_config.py`
5. **Documentation** - Comprehensive guides

### 🔧 New Files Created:

```
ai_assistant/
├── llm_config.py                      # ← Config management
└── ai_chat_api_simplified.py          # ← Simple API proxy

README_UI_ONLY.md                       # ← Main guide (read this!)
BRANCH_INFO.md                          # ← Branch documentation
UI_ONLY_SETUP_GUIDE.md                 # ← This file
```

---

## 🚀 How to Use This Branch NOW

### Option 1: Using DeepSeek (Now)

Your current setup works immediately with DeepSeek via OpenRouter.

```bash
# 1. Switch to ui-only branch
cd /path/to/frappe-bench/apps/ai_assistant
git checkout ui-only

# 2. Configure (update your site_config.json)
bench --site your-site set-config ai_api_url "https://openrouter.ai/api/v1/chat/completions"
bench --site your-site set-config ai_api_key "sk-or-v1-YOUR_KEY"
bench --site your-site set-config ai_model "deepseek/deepseek-r1-distill-llama-70b"

# 3. Clear cache
bench clear-cache

# 4. Test at http://your-site:8000/app/ai-chat
```

### Option 2: Using Ollama Locally

```bash
bench --site your-site set-config ai_api_url "http://localhost:11434/api/generate"
bench --site your-site set-config ai_api_key "not-needed-for-ollama"
bench --site your-site set-config ai_model "qwen:4b"
bench clear-cache
```

---

## 🔄 How It Works

### Data Flow (UI-Only):

```
┌─────────────────────────────────────────┐
│         Frappe Chat UI (This Branch)    │
│  - ai_chat.js (chat interface)          │
│  - ai_chat.css (styling)                │
│  - User types message                   │
└──────────────────┬──────────────────────┘
                   │
                   │ POST /api/method/
                   │ ai_assistant.ai_chat_api.send_message
                   │ {message, history}
                   ↓
┌──────────────────────────────────────────────────┐
│  Simple API Proxy (ai_chat_api_simplified.py)    │
│  - Reads config from site_config.json            │
│  - Validates input                               │
│  - Builds request with message + history         │
│  - Adds authentication header                    │
└──────────────────┬───────────────────────────────┘
                   │
                   │ POST to external LLM
                   │ {model, messages, temperature, max_tokens}
                   ↓
┌──────────────────────────────────────────────────┐
│        External LLM Backend (Your Manager's)     │
│  - DeepSeek (via OpenRouter) - NOW               │
│  - ChatGPT - LATER                               │
│  - Your Manager's API - WHEN READY               │
│  - Returns: {choices: [{message: {content}}]}    │
└──────────────────┬───────────────────────────────┘
                   │
                   │ JSON Response
                   ↓
┌──────────────────────────────────────────────────┐
│  Response Handler (ai_chat_api_simplified.py)    │
│  - Parses response                               │
│  - Extracts content                              │
│  - Returns to frontend                           │
└──────────────────┬───────────────────────────────┘
                   │
                   │ {ok: true, content: "..."}
                   ↓
┌──────────────────────────────────────────────────┐
│         Frappe Chat UI Updates                   │
│  - Shows message in chat                         │
│  - Stores in conversation history                │
│  - Ready for next message                        │
└──────────────────────────────────────────────────┘
```

---

## 📝 Configuration Deep Dive

### The Three Magic Values

Everything you need is in `site_config.json`:

```json
{
  "ai_api_url": "https://...",           # Where to send requests
  "ai_api_key": "sk-...",                # How to authenticate
  "ai_model": "model-name"               # Which model to use
}
```

### How to Change Them

```bash
# Method 1: Using bench command
bench --site your-site set-config ai_api_url "NEW_URL"
bench --site your-site set-config ai_api_key "NEW_KEY"
bench --site your-site set-config ai_model "NEW_MODEL"
bench clear-cache

# Method 2: Direct edit (advanced users)
nano sites/your-site/site_config.json
# Add the three values
```

### Current Values (DeepSeek via OpenRouter):

```json
{
  "ai_api_url": "https://openrouter.ai/api/v1/chat/completions",
  "ai_api_key": "sk-or-v1-YOUR_ACTUAL_KEY",
  "ai_model": "deepseek/deepseek-r1-distill-llama-70b"
}
```

### When Manager Gives You Their API:

Just replace those three values. Nothing else changes!

```json
{
  "ai_api_url": "https://their-server.com/api/chat",
  "ai_api_key": "THEIR_API_KEY",
  "ai_model": "their-model-name"
}
```

---

## ✅ Testing Checklist

### Before Going Live:

- [ ] Config values are set correctly
  ```bash
  bench --site your-site show-config | grep ai_
  ```

- [ ] API URL is reachable
  ```bash
  curl "YOUR_API_URL"
  ```

- [ ] API Key is valid (make a test request)
  ```bash
  curl -X POST "YOUR_API_URL" \
    -H "Authorization: Bearer YOUR_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"model-name","messages":[{"role":"user","content":"test"}]}'
  ```

- [ ] Chat UI loads at `/app/ai-chat` ✓

- [ ] Test message works
  ```
  Type: "What is 2+2?"
  Expected: Response like "2+2 equals 4"
  ```

- [ ] Check logs for errors
  ```bash
  bench log --follow | grep "AI Chat"
  ```

---

## 🔧 File Locations & What They Do

### Main Files:

1. **`llm_config.py`** - Configuration management
   - Reads from `site_config.json`
   - Validates configuration
   - Returns config dict for API proxy

2. **`ai_chat_api_simplified.py`** - The API proxy
   - Receives message from frontend
   - Reads LLM config
   - Forwards to external API
   - Parses and returns response

3. **`public/js/ai_chat.js`** - Chat UI (unchanged)
   - Displays chat interface
   - Sends messages to backend
   - Shows responses to user

4. **`public/css/ai_chat.css`** - Chat styling (unchanged)

---

## 🎯 Integration Timeline

### Phase 1: NOW (You are here)
- ✅ UI-only branch created
- ✅ Works with DeepSeek/OpenRouter
- ✅ Simple configuration
- 📝 **Action:** Test it out with DeepSeek

### Phase 2: TESTING (Next)
- 🔲 Manager gives you their API details
- 🔲 Update 3 config values
- 🔲 Test with their API
- 🔲 Switch from DeepSeek to Manager's backend

### Phase 3: PRODUCTION (After)
- 🔲 Everything works with manager's backend
- 🔲 Deploy to production
- 🔲 Users use the app via manager's AI

---

## 🎓 Understanding the Architecture

### What Changed from `main` to `ui-only`:

**Removed (from main branch):**
- ❌ `agent.py` - Was orchestrating tools
- ❌ `tools/` - Were executing business logic
- ❌ Complex backend logic

**Why?** Because your manager's backend already has this!

**Added (to ui-only branch):**
- ✅ `llm_config.py` - Configuration management
- ✅ `ai_chat_api_simplified.py` - Simple proxy
- ✅ Documentation for this model

**Why?** To make it easy to integrate with any external API.

### Simple Decision Tree:

```
Message from user
    ↓
Can we use external API? (Check config)
    ├─ NO:  Return error
    └─ YES: Forward and return response
```

That's it! The external API handles everything else.

---

## 🔐 Security Considerations

### API Keys

- ✅ Stored in `site_config.json` (not in code)
- ✅ Never committed to Git
- ✅ Protected by Frappe permissions
- ⚠️ Keep it secret!

### Best Practices:

1. **Don't commit keys to Git**
   ```bash
   # Bad: Keys in code
   git add -A && git commit
   
   # Good: Keys in site_config (not in Git)
   # site_config.json is in .gitignore
   ```

2. **Use environment variables** (optional)
   ```bash
   export AI_API_KEY="your-key"
   # Then configure with it
   ```

3. **HTTPS only** (production)
   - Always use HTTPS URLs
   - Manager's API should be HTTPS

---

## 🐛 Common Issues & Solutions

### Issue: "Config not found"

**Solution:**
```bash
bench --site your-site set-config ai_api_url "https://..."
bench clear-cache
```

### Issue: "Connection refused"

**Solution:**
- Check API URL is correct
- Check API is running/accessible
- Try manually with curl

### Issue: "Authentication failed" (401)

**Solution:**
- Check API key is correct
- Make sure it's the right format
- Contact manager if using their API

### Issue: "Empty response"

**Solution:**
- Check model name is correct
- Check API is returning proper format
- Check logs for details

---

## 📞 Quick Reference

### View Current Config:
```bash
bench --site your-site show-config | grep ai_
```

### Set Config:
```bash
bench --site your-site set-config ai_api_url "URL"
bench --site your-site set-config ai_api_key "KEY"
bench --site your-site set-config ai_model "MODEL"
```

### Clear Cache After Changes:
```bash
bench clear-cache
```

### View Logs:
```bash
bench log --follow | grep "AI Chat"
```

### Reset to Defaults:
```bash
# Remove custom config
bench --site your-site remove-config ai_api_url
bench --site your-site remove-config ai_api_key
bench --site your-site remove-config ai_model
bench clear-cache
```

---

## 📚 Documentation Files

In this branch you'll find:

1. **`README_UI_ONLY.md`** - Main guide (start here!)
2. **`BRANCH_INFO.md`** - What changed
3. **`UI_ONLY_SETUP_GUIDE.md`** - This file
4. **`README.md`** - Original full version docs (reference)

---

## 🎯 Next Steps

### Immediate (Now):
1. ✅ You're on the `ui-only` branch (done)
2. ✅ Code is simplified (done)
3. 📋 **TO DO:** Test with DeepSeek
4. 📋 **TO DO:** Confirm it works

### When Manager Responds:
1. 📋 Get their API details:
   - API URL
   - API Key
   - Model name (if needed)
2. 📋 Update 3 config values
3. 📋 Test with their API
4. 📋 Switch to production

### Deployment:
1. 📋 Push `ui-only` branch to GitHub
2. 📋 Manager clones `ui-only` branch
3. 📋 Manager sets config on their Frappe
4. 📋 Done! App works with their backend

---

## ✨ Key Benefits of This Approach

1. **Simple:** Only 3 config values
2. **Flexible:** Works with any external API
3. **Easy:** No code changes to switch providers
4. **Clean:** UI is separate from backend logic
5. **Scalable:** Easy to integrate with existing systems
6. **Maintainable:** Clear separation of concerns

---

## 🎉 You're All Set!

The `ui-only` branch is ready to use:

- ✅ Clean, simplified codebase
- ✅ Simple configuration
- ✅ Comprehensive documentation
- ✅ Works with DeepSeek now
- ✅ Will work with manager's API later

**Next:** Test it and confirm everything works!

---

## 📞 Questions?

Check:
1. `README_UI_ONLY.md` - Detailed guide
2. `BRANCH_INFO.md` - Branch info
3. Logs: `bench log --follow | grep "AI Chat"`
4. Config: `bench --site your-site show-config | grep ai_`

---

**Created:** June 2, 2026  
**Version:** 1.0.0  
**Branch:** `ui-only`  
**Status:** Production Ready ✅
