# AI Assistant for Frappe/ERPNext - Installation Guide

**For:** Your Frappe Team | **Setup Time:** ~10 minutes | **Branch:** `ui-only`

Chat interface for your external LLM backend. Follow these steps.

---

## 🚀 Installation (5 Simple Steps)

### 1. Get the App

```bash
cd /path/to/your/frappe-bench
bench get-app ai_assistant https://github.com/fonkamariam/Frappe_Ai_Assistant_app.git --branch ui-only
```

### 2. Install

```bash
bench install-app ai_assistant
```

### 3. Build & Migrate

```bash
bench build
bench migrate
bench clear-cache
```

### 4. Configure

Edit `sites/your-site/site_config.json` and add:

```json
{
  "ai_api_url": "https://your-llm-api/endpoint",
  "ai_api_key": "your-api-key",
  "ai_model": "model-name"
}
```

**For testing with DeepSeek:**
```json
{
  "ai_api_url": "https://openrouter.ai/api/v1/chat/completions",
  "ai_api_key": "sk-or-v1-YOUR_OPENROUTER_KEY",
  "ai_model": "deepseek/deepseek-r1-distill-llama-70b"
}
```

### 5. Start & Test

```bash
bench start
```

Then visit: `http://localhost:8000/app/ai-chat`

Type a message → You should see a response ✅

---

## ⚙️ Configuration Reference

| Key | Description | Example |
|-----|-------------|---------|
| `ai_api_url` | LLM API endpoint | `https://api.example.com/chat` |
| `ai_api_key` | Authentication key | `sk-...` |
| `ai_model` | Model name | `gpt-4` or `deepseek-...` |

---

## 🔧 After Installation Commands

```bash
# Update config
bench --site your-site set-config ai_api_url "NEW_URL"
bench --site your-site set-config ai_api_key "NEW_KEY"
bench --site your-site set-config ai_model "NEW_MODEL"

# Clear cache after config changes
bench clear-cache

# Check config
bench --site your-site show-config | grep ai_

# View logs
bench log --follow | grep "AI Chat"
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Config not found" | Add `ai_api_url`, `ai_api_key`, `ai_model` to `site_config.json` |
| "Connection refused" | Check API URL is correct and accessible |
| "Empty response" | Check API key is valid and model name is correct |
| Chat UI doesn't load | Run `bench build` then refresh browser |

---

## 📝 Full Walkthrough

```bash
# Clone
bench get-app ai_assistant https://github.com/fonkamariam/Frappe_Ai_Assistant_app.git --branch ui-only

# Install
bench install-app ai_assistant

# Build
bench build
bench migrate
bench clear-cache

# Configure (edit this file)
nano sites/your-site/site_config.json
# Add the 3 config values

# Start
bench start

# Test
# Visit: http://localhost:8000/app/ai-chat
# Send a message
```

---

## ✅ Quick Test Checklist

- [ ] App installed: `bench list-apps | grep ai_assistant`
- [ ] Config set: `bench --site your-site show-config | grep ai_`
- [ ] Build done: `bench build` (no errors)
- [ ] Migrated: `bench migrate` (no errors)
- [ ] Chat loads: Visit `/app/ai-chat` in browser
- [ ] Responses work: Send message and get reply

---

## 🔄 To Switch LLM Provider

Just update 3 config values:

```bash
bench --site your-site set-config ai_api_url "NEW_API_URL"
bench --site your-site set-config ai_api_key "NEW_KEY"
bench --site your-site set-config ai_model "NEW_MODEL"
bench clear-cache
bench restart
```

---

## 📚 More Info

- `README.md` - Feature overview
- `BRANCH_INFO.md` - Branch details
- `UI_ONLY_SETUP_GUIDE.md` - Advanced setup

---

**Status:** Ready to Install ✅
