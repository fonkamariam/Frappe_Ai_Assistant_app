# Tool-Calling Agent Architecture

## Overview

The AI Assistant backend has been refactored into a **tool-calling agent architecture** that enables the AI model to:
1. Detect when a user query requires external data
2. Call specialized tools (e.g., financial reports) to fetch real data
3. Integrate tool results back into the conversation
4. Generate a final response based on actual data (no hallucinated numbers)

## Architecture Components

### 1. Tool Registry (`tools/registry.py`)

**Responsible for:**
- Managing all available tools
- Generating OpenAI function-calling schemas
- Tool validation and execution
- Error handling during tool execution

**Key Classes:**
- `Tool` — Base class for all tools
- `ToolRegistry` — Central registry managing tool lifecycle

**Usage:**
```python
from tools import get_registry

registry = get_registry()
schemas = registry.get_schemas()  # For model instruction
result = registry.execute_tool("generate_profit_loss_report", {"company": "Acme Inc"})
```

### 2. Finance Module (`tools/finance.py`)

**Currently Implemented:**
- `ProfitLossReportTool` — Generates P&L statements from GL entries

**Tool Schema:**
```json
{
  "name": "generate_profit_loss_report",
  "description": "Generate a Profit & Loss (Income Statement) report...",
  "parameters": {
    "properties": {
      "company": "Company name or empty for default",
      "from_date": "YYYY-MM-DD format",
      "to_date": "YYYY-MM-DD format"
    }
  }
}
```

**Data Source:**
- Reads from ERPNext GL Entry DocType
- Uses Account types to categorize (Revenue, COGS, Expenses)
- Returns structured JSON with actual financial data

### 3. Agent Loop (`agent.py`)

**Orchestrates:**
1. **Message building** — System prompt + history + latest message
2. **Model call** — Sends to OpenRouter with tool schemas
3. **Tool detection** — Parses `tool_calls` from model response
4. **Tool execution** — Runs tools and collects results
5. **Result integration** — Adds tool results back to messages
6. **Response generation** — Model generates final response using tool data

**Agent State Machine:**
```
User Message → Add to messages → Call Model
                                    ↓
                            Tool calls detected?
                           /                  \
                         YES                  NO
                          ↓                    ↓
                  Execute Tools          Return Response
                          ↓
                  Add Results to Messages
                          ↓
                  Call Model Again (up to 5 iterations)
```

**Key Method:**
```python
agent = Agent(model, api_key, tools_registry)
result = agent.run(user_message, history, max_tokens)
```

### 4. API Endpoint (`ai_chat_api.py`)

**Endpoint:** `POST /api/method/ai_assistant.ai_chat_api.send_message`

**Changes:**
- Replaced direct OpenRouter calls with Agent
- Added tool registry initialization
- Maintains backward compatibility with existing frontend
- Returns tool_calls in response for transparency

**Response:**
```json
{
  "ok": true,
  "content": "Based on Q1 2024, Acme Inc had...",
  "reasoning_content": "Model thinking process...",
  "model": "deepseek/deepseek-r1:free",
  "usage": {"prompt_tokens": 1000, "completion_tokens": 500},
  "tool_calls": [
    {
      "tool_name": "generate_profit_loss_report",
      "input": {"company": "Acme Inc", "from_date": "2024-01-01"},
      "result": {"revenue": 50000, "expenses": 30000, "net_profit": 20000}
    }
  ]
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (ai_chat.js)                         │
│                 User types: "Profit for Q1?"                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                      POST /api/method/send_message
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    ai_chat_api.py (Whitelist)                    │
│  • Validate input                                                │
│  • Check API key                                                 │
│  • Initialize Agent                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      Agent Loop                                  │
│  messages = [system_prompt, history..., "Profit for Q1?"]       │
│  Call OpenRouter with tools                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    Model detects tool needed
                             │
┌────────────────────────────▼────────────────────────────────────┐
│         Model Response: tool_calls=[...]                        │
│  "I need to fetch the P&L report for Q1"                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  Agent executes tool                             │
│  registry.execute_tool("generate_profit_loss_report", {...})    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│            Tool queries ERPNext database (GL Entry)              │
│  Returns: {revenue: 50000, cogs: 20000, net_profit: 30000}     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│    Agent adds tool result to messages and calls model again      │
│  messages = [..., tool_result={...}]                            │
│  "Now generate final response using this data"                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│      Model generates final response using actual data            │
│  "Q1 profit was $30k based on actual GL entries"                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                  Return response to frontend
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Frontend displays response                    │
│         with tool_calls showing what was executed               │
└─────────────────────────────────────────────────────────────────┘
```

## Preventing Hallucination

### Strategy 1: Tool-Based Guardrails
- Financial queries **must** use `generate_profit_loss_report` tool
- Data comes from verified GL entries, not model generation
- System prompt directs model to use tools for business data

### Strategy 2: Data Validation
- Only account types in ERPNext are used for categorization
- GL entries are verified to exist and belong to company
- Fiscal year dates are validated

### Strategy 3: Result Structuring
- Tools return JSON with specific fields (revenue, cogs, etc.)
- Model can't modify tool results, only summarize them
- Error handling prevents partial/corrupted data

## Adding New Tools

### Example: Revenue Report Tool

1. **Create tool class** in `tools/finance.py`:
```python
class RevenueReportTool(Tool):
    def __init__(self):
        schema = {
            "type": "object",
            "properties": {
                "company": {"type": "string"},
                "from_date": {"type": "string"},
                "to_date": {"type": "string"}
            },
            "required": []
        }
        super().__init__(
            name="generate_revenue_report",
            description="...",
            schema=schema
        )
    
    def execute(self, **kwargs) -> Dict[str, Any]:
        # Implementation
        return {"total_revenue": 50000, ...}
```

2. **Register in `tools/registry.py`:**
```python
def _initialize_tools(registry: ToolRegistry) -> None:
    from .finance import ProfitLossReportTool, RevenueReportTool
    registry.register(ProfitLossReportTool())
    registry.register(RevenueReportTool())  # Add this
```

3. **Update system prompt** in `agent.py`:
```python
def _get_system_prompt(self) -> str:
    tool_names = ", ".join(self.tools_registry.list_all())
    # Returns: "generate_profit_loss_report, generate_revenue_report"
```

## Configuration

Set via Frappe site config:
```bash
bench --site <site> set-config openrouter_api_key "sk-..."
bench --site <site> set-config openrouter_model "deepseek/deepseek-r1:free"
bench --site <site> set-config openrouter_max_tokens "4096"
```

## Error Handling

### Tool Errors
```json
{
  "success": false,
  "error": "Company 'Invalid Inc' does not exist",
  "tool_name": "generate_profit_loss_report"
}
```

### Validation Errors
- Invalid date format → HTTP 400
- Empty message → HTTP 400
- Missing API key → HTTP 503

### Upstream Errors
- Model timeout → HTTP 502
- Network error → HTTP 502
- Rate limited → HTTP 429

## Testing

### Manual Test
```bash
curl -X POST http://localhost:8000/api/method/ai_assistant.ai_chat_api.send_message \
  -d "message=What was the profit in Q1?" \
  -d "history=[]"
```

### Unit Tests
See `tests/unit/test_ai_chat_api.py` for tool execution tests.

### Integration Tests
See `tests/integration/test_openrouter_integration.py` for agent loop tests.

## Performance Considerations

- **Max Tool Iterations:** 5 (prevents infinite loops)
- **Max History:** 20 messages (reduces token usage)
- **Timeout:** 120 seconds for model requests
- **GL Entry Query:** Capped to avoid large fetches

## Backward Compatibility

✅ **Fully compatible** with existing frontend:
- Response format unchanged (except added `tool_calls`)
- Same error codes and structure
- Existing tests pass without modification

## Future Enhancements

1. **More Finance Tools:**
   - Balance Sheet generator
   - Cash Flow statement
   - Account analysis

2. **Document Tools:**
   - Search documents
   - Extract data from forms

3. **System Tools:**
   - User management
   - Configuration helpers

4. **Caching:**
   - Cache tool results for N minutes
   - Reduce database queries

5. **Tool Permissions:**
   - Control which users can call which tools
   - Audit tool execution

## Architecture Benefits

✅ **Modularity:** Each tool is self-contained  
✅ **Scalability:** Easy to add new tools  
✅ **Safety:** No hallucinated financial data  
✅ **Transparency:** Frontend knows which tools were used  
✅ **Compliance:** Full audit trail of tool execution  
✅ **Maintainability:** Clear separation of concerns  
