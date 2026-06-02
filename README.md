# AI Assistant for Frappe/ERPNext

An intelligent AI chatbot for Frappe/ERPNext. Two versions available:

| Branch | Use Case | Setup Time |
|--------|----------|-----------|
| **`main`** | Complete standalone app with tools & agent | ~15 min |
| **`ui-only`** | Chat UI only (integrates with external backend) | ~10 min |

---

## 🚀 Quick Installation (UI-Only Version)

**For integrating with your existing LLM backend:**

```bash
# 1. Get the app
cd /path/to/your/frappe-bench
bench get-app ai_assistant https://github.com/fonkamariam/Frappe_Ai_Assistant_app.git --branch ui-only

# 2. Install
bench install-app ai_assistant

# 3. Build & migrate
bench build
bench migrate
bench clear-cache

# 4. Configure (edit sites/your-site/site_config.json)
{
  "ai_api_url": "https://your-llm-api/endpoint",
  "ai_api_key": "your-api-key",
  "ai_model": "model-name"
}

# 5. Start
bench start

# 6. Test: Visit http://localhost:8000/app/ai-chat
```

**👉 See `README_UI_ONLY.md` for detailed installation guide**

---

## 📋 What Each Version Offers

### `main` Branch (Full Version)
✅ Complete AI Assistant  
✅ Built-in tools (P&L reports, etc.)  
✅ Agent orchestration  
✅ Standalone (no external backend needed)  

### `ui-only` Branch (Integration Version)
✅ Chat UI only  
✅ Connects to external LLM backend  
✅ Simple configuration (3 values)  
✅ No code changes to switch providers  

---

## 🔧 Configuration Reference

**For `ui-only` branch, add to `site_config.json`:**

```json
{
  "ai_api_url": "https://your-api-endpoint",
  "ai_api_key": "your-api-key",
  "ai_model": "model-name"
}
```

**Example (DeepSeek via OpenRouter):**
```json
{
  "ai_api_url": "https://openrouter.ai/api/v1/chat/completions",
  "ai_api_key": "sk-or-v1-YOUR_KEY",
  "ai_model": "deepseek/deepseek-r1-distill-llama-70b"
}
```

---

## 📚 Documentation

- **`README_UI_ONLY.md`** ← Installation & setup (start here!)
- **`BRANCH_INFO.md`** ← What's in each branch
- **`UI_ONLY_SETUP_GUIDE.md`** ← Detailed instructions

---

## 💬 Chat Interface Features

- 💬 Real-time chat with message history
- 📝 Conversation persistence
- 🔄 Supports any external LLM API
- ⚡ Lightweight & fast
- 🔐 API key in config (not in code)

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Config not found | Add all 3 config values to `site_config.json` |
| Connection refused | Check API URL is correct and accessible |
| Chat won't load | Run `bench build` and refresh browser |

---

## 📝 License

MIT License - See `LICENSE.txt`

## 👤 Author

**Fikremariam** (fbesrat11@gmail.com)

---

**Status:** Production Ready ✅  
**Branch:** `ui-only` (recommended for integration)
