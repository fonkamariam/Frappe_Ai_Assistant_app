# AI Assistant for Frappe/ERPNext

An intelligent AI chatbot for Frappe/ERPNext that answers questions about your business data with **verified data source tracking**. When the AI uses your actual database, a "📊 ERPNext" badge confirms the data is real, not hallucinated.

## 🌟 What It Does

- 🤖 **Ask Questions** - Natural language queries about your ERPNext data
- 📊 **Get Verified Answers** - See "📊 ERPNext" badge proving data came from your database
- 📈 **Financial Reports** - Generate P&L reports and financial analysis
- 💬 **Chat History** - Persistent conversations with data source tracking
- 🔌 **Smart Tool Use** - AI automatically uses tools when it needs real data

## 📋 Requirements

- **Frappe**: v14+ or v15+
- **Python**: 3.10+
- **LLM**: OpenRouter API key OR local Ollama
- **Browser**: Modern browser with WebSocket support

## 🚀 Installation Guide

### Step 1: Clone the Repository

```bash
# Navigate to your Frappe bench directory
cd /path/to/your/frappe-bench

# Get the app
bench get-app ai_assistant https://github.com/yourusername/ai_assistant --branch main

# Or if cloning locally:
cd apps
git clone https://github.com/yourusername/ai_assistant
cd ..
```

### Step 2: Install Dependencies

```bash
# Install the app in your bench
bench install-app ai_assistant

# Install Python dependencies (if any)
bench pip install -r apps/ai_assistant/requirements.txt
```

### Step 3: Configure LLM Provider

Choose one option below:

**OpenRouter (Production):**
```bash
bench --site your-site set-config openrouter_api_key "sk-or-v1-YOUR_KEY"
bench --site your-site set-config ai_provider "openrouter"
```

**Ollama (Local Development):**
```bash
bench --site your-site set-config ai_provider "ollama"
bench --site your-site set-config ai_model "qwen:4b"
```

### Step 4: Done! Start Using

Navigate to `/app/ai-chat` and start asking questions.

## 🔧 Configuration

Edit your site's `site_config.json`:

**For OpenRouter:**
```json
{
  "ai_provider": "openrouter",
  "openrouter_api_key": "sk-or-v1-YOUR_KEY"
}
```

**For Ollama:**
```json
{
  "ai_provider": "ollama",
  "ai_model": "qwen:4b",
  "ollama_base_url": "http://localhost:11434"
}
```

## 📖 Usage Examples

### Example 1: Generate Profit & Loss Report

**User:** "Generate a profit and loss report for 2023"

**AI Response:** 
```
Based on your GL Entry data:

Total Revenue: $487,234.56
Total Expenses: $312,145.23
Net Profit: $175,089.33

Key Accounts:
- Sales: $487,234.56
- Cost of Goods Sold: $198,567.89
- Operating Expenses: $113,577.34
```

**Badge:** 📊 ERPNext ← Data verified from database

### Example 2: Customer Analysis

**User:** "Who are my top 5 customers by revenue?"

**AI Response:** Shows top customers with verified data from Sales Invoices

### Example 3: Cash Flow Query

**User:** "What was my cash position in March?"

**AI Response:** Queries your accounting data and provides verified cash flow analysis

## 🏗️ How It Works

When you ask a question:
1. Your message is sent to the AI model
2. AI decides if it needs to query your ERPNext data
3. If yes, it executes a **tool** (like P&L report generator)
4. The tool queries your database and returns results
5. Response shows with "📊 ERPNext" badge (data verified)
6. If no tool was used, no badge appears (AI-only response)

## 🐛 Troubleshooting

**"Access denied for database user"**
```bash
# Recreate database user
bench rebuild-search-index --site your-site
```

**"OpenRouter API key not set"**
```bash
bench --site your-site set-config openrouter_api_key "your-key"
bench clear-cache
```

**"Ollama connection refused"**
```bash
# Ensure Ollama is running
ollama serve

# Test connection
curl http://localhost:11434/api/tags

# Update URL if using Docker
bench --site your-site set-config ollama_base_url "http://host.docker.internal:11434"
```

**"No badge on responses"**
- This means the AI didn't use any tools
- It happens when the AI decides it has enough context to answer
- Is normal behavior

## 📚 Learn More

Documentation files included:
- `AGENT_ARCHITECTURE.md` - How the AI agent works
- `DATA_VERIFICATION_GUIDE.md` - Data verification details
- `DOCKER_QUICK_START.md` - Docker deployment

## 📝 License

MIT License - See `LICENSE.txt`

## 👤 Author

**Fikremariam** (fbesrat11@gmail.com)

---

**Status**: Production Ready ✅
