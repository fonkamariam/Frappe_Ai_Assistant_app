# UI-Only Branch Information

## What Is This Branch?

This is the **`ui-only`** branch - a simplified version containing:
- ✅ Chat UI (JavaScript, CSS, HTML)
- ✅ Simple API proxy (forwards requests)
- ✅ Configuration management

## What Was Removed?

The following files/folders from the `main` branch are NOT included:

### Backend Files (Removed)
- ❌ `agent.py` - AI agent orchestration (your backend handles this)
- ❌ `tools/` - All tool definitions (your backend handles this)
- ❌ Complex backend logic

### Why Were They Removed?

**Because:**
- Your manager's backend already has all this
- Keeping them would cause conflicts
- This branch should be lightweight
- Easy to integrate with existing backends

## What's Kept?

### Frontend (UI Layer)
```
public/
├── js/
│   └── ai_chat.js         # Chat interface logic
├── css/
│   └── ai_chat.css        # Chat UI styling
└── page/
    └── ai_chat/           # Chat page definition
```

### Backend (Simple Proxy)
```
ai_assistant/
├── llm_config.py                    # NEW: Config management
├── ai_chat_api_simplified.py        # NEW: Simple API proxy
└── hooks.py                         # App registration
```

## How to Use This Branch

1. **Clone it:**
   ```bash
   git clone --branch ui-only https://github.com/fonkamariam/Frappe_Ai_Assistant_app.git
   ```

2. **Set up config** (see README_UI_ONLY.md)

3. **That's it!** The UI will forward requests to your external API

## When to Merge Back to Main

This branch and main should stay separate because:
- `main` has full backend with tools/agent
- `ui-only` is just UI + simple proxy
- They serve different use cases
- Merging would create conflicts

## Key Files to Understand

1. **`llm_config.py`** - Where all configuration is read from
2. **`ai_chat_api_simplified.py`** - The API proxy (forwards to external LLM)
3. **`public/js/ai_chat.js`** - The chat UI (unchanged from main)

## Integration Flow

```
User types in Frappe UI
    ↓
ai_chat.js sends message to backend
    ↓
ai_chat_api_simplified.py receives it
    ↓
Reads config (URL, key)
    ↓
Forwards to external API (manager's backend, DeepSeek, etc.)
    ↓
External API returns response
    ↓
Response returned to frontend
    ↓
UI displays response
```

## Switching External APIs

To switch from DeepSeek to ChatGPT or Manager's API:

**Only change these values in `site_config.json`:**
```json
{
  "ai_api_url": "NEW_URL",
  "ai_api_key": "NEW_KEY",
  "ai_model": "NEW_MODEL"
}
```

**NO code changes needed!**

## Configuration Made Simple

The entire backend configuration lives in:
- `site_config.json` (your Frappe config file)

Just 3 values:
```json
{
  "ai_api_url": "...",    # Where to send requests
  "ai_api_key": "...",    # Authentication
  "ai_model": "..."       # Which model to use
}
```

That's all you need to change to integrate with any backend.

---

For detailed instructions, see: **`README_UI_ONLY.md`**
