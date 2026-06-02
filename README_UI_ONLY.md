# AI Assistant for Frappe/ERPNext - UI-Only Version

**This is the UI-only branch** (`ui-only`). It provides just the chat interface with a configurable external LLM API proxy. Perfect for integration with existing Frappe AI backends.

## 🎯 What This Is

This is a **simple, flexible chat UI** that:
- Displays a chat interface in Frappe
- Sends messages to an external LLM API
- Shows responses back to the user
- Stores conversation history

It does **NOT** include:
- Tool orchestration (agent.py)
- Business logic tools (tools/)
- Database query logic
- Any backend ML/AI logic

## 🚀 Who Should Use This?

✅ **You should use this if:**
- You have an existing LLM backend elsewhere
- Your backend handles all the logic
- You just need a UI in Frappe
- You want something simple and flexible

❌ **You should NOT use this if:**
- You want a complete standalone AI solution
- You need local tool execution
- You want data verification badges (that needs backend logic)

---

## 📋 How It Works

```
┌─────────────────────┐
│   Frappe UI Layer   │  ← This branch (ai_chat.js, ai_chat.css)
│  (Chat Interface)   │
└──────────────┬──────┘
               │ Send message
               ↓
┌─────────────────────────────────────────────┐
│  This Simplified Backend (ai_chat_api.py)   │  ← Simple proxy
│  - Validates input                          │
│  - Reads config                             │
│  - Forwards to external LLM                 │
└──────────────┬──────────────────────────────┘
               │ POST with message + history
               ↓
┌──────────────────────────────────┐
│  Your External LLM Backend       │  ← Manager's backend, DeepSeek, ChatGPT, etc.
│  - Tool orchestration            │
│  - Business logic                │
│  - Database queries              │
│  - Everything else               │
└──────────────┬───────────────────┘
               │ JSON response
               ↓
┌─────────────────────┐
│   UI Displays it    │  ← User sees the answer
└─────────────────────┘
```

---

## ⚙️ Configuration

The entire setup lives in **one place**: your `site_config.json`

### For DeepSeek (via OpenRouter) - Now:

```json
{
  "ai_api_url": "https://openrouter.ai/api/v1/chat/completions",
  "ai_api_key": "sk-or-v1-YOUR_OPENROUTER_KEY",
  "ai_model": "deepseek/deepseek-r1-distill-llama-70b"
}
```

### For ChatGPT - Later:

```json
{
  "ai_api_url": "https://api.openai.com/v1/chat/completions",
  "ai_api_key": "sk-YOUR_OPENAI_KEY",
  "ai_model": "gpt-4"
}
```

### For Your Manager's Backend - When Ready:

```json
{
  "ai_api_url": "https://their-server.com/api/chat/send-message",
  "ai_api_key": "THEIR_API_KEY",
  "ai_model": "their-model-name"
}
```

**That's it!** No code changes needed when you switch providers.

---

## 🚀 Installation

### Step 1: Clone This Branch

```bash
cd /path/to/your/frappe-bench

# Clone the ui-only branch
bench get-app ai_assistant https://github.com/fonkamariam/Frappe_Ai_Assistant_app.git --branch ui-only

# Or if cloning locally
cd apps
git clone https://github.com/fonkamariam/Frappe_Ai_Assistant_app.git ai_assistant
cd ai_assistant
git checkout ui-only
cd ../..
```

### Step 2: Install the App

```bash
bench install-app ai_assistant
```

### Step 3: Configure Your LLM

Edit your site's `site_config.json`:

```bash
# For OpenRouter (DeepSeek)
bench --site your-site set-config ai_api_url "https://openrouter.ai/api/v1/chat/completions"
bench --site your-site set-config ai_api_key "sk-or-v1-YOUR_KEY"
bench --site your-site set-config ai_model "deepseek/deepseek-r1-distill-llama-70b"
```

### Step 4: Test It

```bash
# Open in browser
http://your-site:8000/app/ai-chat

# Ask a question
# If you see a response, it works! ✅
```

---

## 🔧 How to Update the LLM Provider

When your manager gives you their API details, simply update the config:

```bash
bench --site your-site set-config ai_api_url "https://their-server.com/api/chat"
bench --site your-site set-config ai_api_key "THEIR_KEY"
bench --site your-site set-config ai_model "their-model"

bench clear-cache
```

**That's it!** No code changes needed. The backend proxy just forwards to the new URL.

---

## 📝 Configuration Reference

### Required Settings

| Config Key | Description | Example |
|-----------|-------------|---------|
| `ai_api_url` | External LLM API endpoint | `https://openrouter.ai/api/v1/chat/completions` |
| `ai_api_key` | API authentication key | `sk-or-v1-...` |
| `ai_model` | Model name to use | `deepseek/deepseek-r1-distill-llama-70b` |

### Optional Settings (Advanced)

```json
{
  "ai_request_timeout": 360,      # Timeout in seconds (default: 360)
  "ai_max_tokens": 2048,          # Max tokens in response (default: 2048)
  "ai_temperature": 0.7           # Creativity 0-1 (default: 0.7)
}
```

---

## 🧪 Testing

### Quick Test (1 minute)

1. Open `/app/ai-chat` in your Frappe instance
2. Type a message: "Hello, what is 2+2?"
3. You should see a response

### Detailed Test

```bash
# Check that config is set
bench --site your-site show-config | grep ai_

# Check logs for errors
bench log --follow | grep "AI Chat"

# Try via terminal
cd /path/to/frappe-bench
bench shell --site your-site
```

Then in the Frappe shell:
```python
from ai_assistant.ai_chat_api import send_message

result = send_message("What is 2+2?")
print(result)
```

---

## 🐛 Troubleshooting

### Issue: "Config Error: AI API URL is not configured"

**Solution:**
```bash
bench --site your-site set-config ai_api_url "https://openrouter.ai/api/v1/chat/completions"
bench --site your-site set-config ai_api_key "sk-or-v1-YOUR_KEY"
bench clear-cache
```

### Issue: "Request timed out"

**Solution:**
- The external API is slow or down
- Increase timeout in config:
  ```bash
  bench --site your-site set-config ai_request_timeout 600
  ```

### Issue: "Cannot connect to AI service"

**Solution:**
- Check the API URL is correct
- Test the URL manually:
  ```bash
  curl -X POST "YOUR_API_URL" \
    -H "Authorization: Bearer YOUR_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"model-name","messages":[{"role":"user","content":"test"}]}'
  ```

### Issue: "Connection refused" for local testing

**If using Ollama locally:**
```bash
# Make sure Ollama is running
ollama serve

# For Docker, use correct host
bench --site your-site set-config ai_api_url "http://host.docker.internal:11434/api/generate"
```

### Issue: Chat is empty or shows errors

**Check:**
1. Is the API key correct?
2. Is the API URL correct?
3. Check browser console for errors (F12)
4. Check Frappe logs:
   ```bash
   bench log --follow | grep "AI Chat"
   ```

---

## 📂 File Structure

What's included in this branch:

```
ai_assistant/
├── ai_assistant/
│   ├── llm_config.py                   # Config management
│   ├── ai_chat_api_simplified.py       # Simple API proxy ← Key file
│   └── [other backend files]
├── public/
│   ├── js/ai_chat.js                   # Chat interface logic
│   ├── css/ai_chat.css                 # Chat styling
│   └── page/ai_chat/                   # Chat page
└── hooks.py                            # App registration
```

### What's NOT included:

- ❌ `agent.py` - Removed (your backend handles this)
- ❌ `tools/` - Removed (your backend handles this)
- ❌ Complex backend logic - Removed

---

## 🔄 API Specification

Your external API should accept requests in this format:

### Request Format

```json
POST /your/api/endpoint

Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "model": "model-name",
  "messages": [
    {"role": "user", "content": "User message here"},
    {"role": "assistant", "content": "AI response here"},
    {"role": "user", "content": "New user message"}
  ],
  "temperature": 0.7,
  "max_tokens": 2048
}
```

### Response Format

```json
{
  "choices": [
    {
      "message": {
        "content": "Response text here"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

(Standard OpenAI format - most APIs follow this)

---

## 🔐 Security

### API Keys

- ✅ Store keys in `site_config.json`, not in code
- ✅ Use HTTPS for all API calls
- ✅ Never commit keys to Git

### Access Control

- Users need "AI Chat" permission to use this
- All requests are logged in Frappe

### Best Practices

1. **Never share API keys** - Keep them confidential
2. **Use site-level config** - Don't hardcode in code
3. **Use HTTPS** - Always use HTTPS URLs
4. **Monitor usage** - Check API usage/costs regularly

---

## 🎯 Future Integration

When your manager provides their API:

1. **Get the details:**
   - API URL
   - API Key
   - Model name (if needed)

2. **Update config:**
   ```bash
   bench --site your-site set-config ai_api_url "their-url"
   bench --site your-site set-config ai_api_key "their-key"
   bench clear-cache
   ```

3. **Done!** No code changes needed

---

## 📚 Documentation Files

- `README.md` (this file) - Overview and setup
- `INSTALLATION_GUIDE.md` - Detailed installation steps
- `API_PROXY_GUIDE.md` - How the proxy works
- `TROUBLESHOOTING.md` - Common issues and fixes

---

## 🔗 Comparison: Full vs UI-Only

| Feature | Full Version | UI-Only (This) |
|---------|------------|---|
| Chat UI | ✅ | ✅ |
| Tool Orchestration | ✅ | ❌ (external) |
| Database Queries | ✅ | ❌ (external) |
| Backend Logic | ✅ | ❌ (external) |
| Configuration | Complex | Simple (1 file) |
| Easy to Integrate | ❌ | ✅ |
| Standalone | ✅ | ❌ |

---

## 💡 Pro Tips

### 1. Test Config Before Full Integration

```bash
# Test that API is reachable
curl "https://your-api-url/endpoint" \
  -H "Authorization: Bearer YOUR_KEY"
```

### 2. Use Environment Variables

```bash
# Set via environment (more secure)
export AI_API_URL="..."
export AI_API_KEY="..."

# Then reference in config
bench --site your-site set-config ai_api_url $AI_API_URL
```

### 3. Monitor API Usage

```bash
# Check logs for API calls
bench log --follow | grep "Calling LLM API"
```

### 4. Keep Backups of Config

```bash
# Backup your config before making changes
cp sites/your-site/site_config.json sites/your-site/site_config.json.backup
```

---

## ✅ Checklist Before Going Live

- [ ] API URL is correct and accessible
- [ ] API Key is valid
- [ ] Config is set in site_config.json
- [ ] Tested in `/app/ai-chat`
- [ ] Logged messages appear in logs
- [ ] External API is returning correct responses
- [ ] SSL/HTTPS is enabled (production)
- [ ] User permissions are set

---

## 📞 Support

If you have issues:

1. Check the troubleshooting section above
2. Check Frappe logs: `bench log --follow`
3. Check browser console: F12
4. Test the API manually with curl
5. Verify config: `bench --site your-site show-config | grep ai_`

---

## 📝 License

MIT License - See `LICENSE.txt`

## 👤 Author

**Fikremariam** (fbesrat11@gmail.com)

---

## 🎉 Summary

This is a **lightweight, flexible UI** for Frappe that can work with any external LLM API:

- ✅ Simple to set up (3 config values)
- ✅ Easy to swap providers (just update config)
- ✅ No code changes needed for integration
- ✅ Perfect for existing backends

**Next Step:** When your manager gives you the API URL and key, just update your `site_config.json` and you're done! 🚀

---

**Version**: 1.0.0 (UI-Only)  
**Branch**: `ui-only`  
**Status**: Ready to Use ✅
