"""
ai_chat_api.py
--------------
Frappe whitelist API for the AI Assistant with tool-calling agent.

Endpoint:
    POST /api/method/ai_assistant.ai_chat_api.send_message

Configuration via site_config.json:
    ai_provider: "ollama" or "openrouter" (default: "ollama")
    
If using OpenRouter:
    openrouter_api_key: Your API key
    openrouter_model: Model name (e.g., "deepseek/deepseek-r1:free")

If using Ollama (local):
    No API key needed. Model defaults to "qwen3.5:4b"

ARCHITECTURE:
    This module uses a tool-calling agent that can execute tools (e.g., generate_profit_loss_report)
    to retrieve real data from ERPNext. The agent loop handles tool detection, execution, and result
    integration back into the conversation.
"""

import json
import time
import frappe
import requests
from .agent import Agent
from .tools import get_registry

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------
DEFAULT_MODEL        = "qwen3.5:0.8b"
DEFAULT_MAX_TOKENS   = 4096
REQUEST_TIMEOUT      = 360          # seconds
MAX_HISTORY_MESSAGES = 20           # cap history to avoid huge payloads
RETRY_WAIT_SECONDS   = 2            # used in error messages


# ---------------------------------------------------------------------------
# Error codes — returned to frontend as structured payloads
# ---------------------------------------------------------------------------
class ApiError:
    MISSING_KEY      = "MISSING_API_KEY"
    INVALID_KEY      = "INVALID_API_KEY"
    RATE_LIMITED     = "RATE_LIMITED"
    TIMEOUT          = "REQUEST_TIMEOUT"
    NETWORK          = "NETWORK_ERROR"
    EMPTY_RESPONSE   = "EMPTY_RESPONSE"
    MALFORMED        = "MALFORMED_RESPONSE"
    UPSTREAM         = "UPSTREAM_ERROR"
    VALIDATION       = "VALIDATION_ERROR"
    TOOL_ERROR       = "TOOL_ERROR"


def _error_response(code, user_message, status_code=400):
    """
    Build a structured error payload.
    Never exposes internal stack traces to the client.
    """
    return {
        "ok":      False,
        "error":   code,
        "message": user_message,
    }


def _success_response(content, reasoning_content=None, model=None, usage=None, tool_calls=None, data_source=None):
    """Build a structured success payload."""
    return {
        "ok":                   True,
        "content":              content,
        "reasoning_content":    reasoning_content or "",
        "model":                model or DEFAULT_MODEL,
        "usage":                usage or {},
        "tool_calls":           tool_calls or [],
        "data_source":          data_source or "Model"
    }


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------
def _get_provider():
    """Get the AI provider from site_config.json. Default: ollama"""
    return frappe.conf.get("ai_provider", "ollama").lower()


def _get_api_key():
    """Read openrouter_api_key from site_config.json (only needed for OpenRouter)."""
    key = frappe.conf.get("openrouter_api_key", "")
    if not key or not key.strip():
        return None
    return key.strip()


def _get_model():
    """Get the model name from site_config, based on provider."""
    provider = _get_provider()
    if provider == "openrouter":
        return frappe.conf.get("openrouter_model", "deepseek/deepseek-r1:free")
    else:
        # Ollama
        return frappe.conf.get("ai_model", DEFAULT_MODEL)


def _get_max_tokens():
    """Allow overriding max_tokens via site_config."""
    return int(frappe.conf.get("ai_max_tokens", DEFAULT_MAX_TOKENS))


# ---------------------------------------------------------------------------
# Message builder (for non-tool conversations, backward compatibility)
# ---------------------------------------------------------------------------
def _build_messages(history, latest_message):
    """
    Assemble the messages array for the OpenRouter API call (legacy, non-tool mode).
    
    Layout:
        [history (capped)] + [latest user message]
    """
    messages = []
    
    # Sanitise and cap history
    valid_roles = {"user", "assistant"}
    clean_history = []
    for item in (history or []):
        role = item.get("role", "")
        content = item.get("content", "")
        if role in valid_roles and isinstance(content, str):
            clean_history.append({"role": role, "content": content.strip()})
    
    # Keep only the last N messages
    if len(clean_history) > MAX_HISTORY_MESSAGES:
        clean_history = clean_history[-MAX_HISTORY_MESSAGES:]
    
    messages.extend(clean_history)
    messages.append({"role": "user", "content": latest_message.strip()})
    return messages


# ---------------------------------------------------------------------------
# Public Frappe endpoint
# ---------------------------------------------------------------------------
@frappe.whitelist()
def send_message(message, history=None):
    """
    POST /api/method/ai_assistant.ai_chat_api.send_message

    Parameters (JSON body or form data):
        message  (str)  — the latest user message
        history  (str)  — JSON-encoded list of {role, content} dicts

    Returns:
        {
            "ok":               true,
            "content":          "...",
            "reasoning_content": "...",
            "model":            "...",
            "usage":            {...},
            "tool_calls":       [...]
        }

    Or on error:
        {
            "ok":      false,
            "error":   "ERROR_CODE",
            "message": "Human-readable message"
        }
    """
    try:
        # ---- Input validation ----
        if not message or not isinstance(message, str) or not message.strip():
            return _error_response(ApiError.VALIDATION, "Message cannot be empty.")

        if len(message) > 32000:
            return _error_response(ApiError.VALIDATION, "Message is too long (max 32,000 characters).")

        # ---- Parse history ----
        parsed_history = []
        if history:
            if isinstance(history, str):
                try:
                    parsed_history = json.loads(history)
                except json.JSONDecodeError:
                    return _error_response(ApiError.VALIDATION, "Invalid conversation history format.")
            elif isinstance(history, list):
                parsed_history = history

        # ---- API key check (only for OpenRouter) ----
        provider = _get_provider()
        if provider == "openrouter":
            api_key = _get_api_key()
            if not api_key:
                frappe.log_error(
                    title="AI Assistant: Missing API Key",
                    message="openrouter_api_key is not set in site_config.json"
                )
                return _error_response(
                    ApiError.MISSING_KEY,
                    "AI service is not configured. Please ask your administrator to set the API key.",
                    status_code=503
                )
        else:
            # Ollama doesn't need API key
            api_key = None

        # ---- Initialize agent and run ----
        try:
            model      = _get_model()
            max_tokens = _get_max_tokens()
            
            tools_registry = get_registry()
            agent = Agent(model, api_key, tools_registry, provider=provider)
            
            result = agent.run(message.strip(), parsed_history, max_tokens)
        except Exception as e:
            frappe.log_error(title="AI Chat API: Agent Error", message=str(e))
            return _error_response(ApiError.UPSTREAM, f"Agent error: {str(e)}", status_code=502)

        # ---- Check for errors in agent result ----
        if not result.get("ok"):
            return _error_response(result.get("error", ApiError.UPSTREAM), result.get("message", "Unknown error"), status_code=502)

        return _success_response(
            content=result.get("content", ""),
            reasoning_content=result.get("reasoning_content", ""),
            model=result.get("model", model),
            usage=result.get("usage", {}),
            tool_calls=result.get("tool_calls", []),
            data_source=result.get("data_source", "Model")
        )
    except Exception as e:
        frappe.log_error(
            title="AI Assistant: Unexpected Error in send_message",
            message=str(e)
        )
        return _error_response(
            ApiError.UPSTREAM,
            "An unexpected error occurred. Please try again.",
            status_code=502
        )