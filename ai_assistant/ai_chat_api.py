"""
ai_chat_api.py
--------------
Frappe whitelist API for the AI Assistant page.

Endpoint:
    POST /api/method/ai_assistant.ai_chat_api.send_message

Reads the OpenRouter API key from site_config.json:
    bench --site <site> set-config openrouter_api_key "<key>"

Model: deepseek/deepseek-r1:free (configurable via site_config)
"""

import json
import time
import frappe
import requests

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------
OPENROUTER_API_URL   = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL        = "gpt-3.5-turbo"
DEFAULT_MAX_TOKENS   = 2048
REQUEST_TIMEOUT      = 120          # seconds — R1 can be slow on first token
MAX_HISTORY_MESSAGES = 20           # cap history to avoid huge payloads
RETRY_WAIT_SECONDS   = 2            # used in error messages

SYSTEM_PROMPT = """You are a helpful, knowledgeable AI assistant embedded in an ERPNext/Frappe environment.
You provide clear, accurate, and concise answers.
When writing code, always specify the language in fenced code blocks.
When reasoning through a problem, think step by step.
Be professional but approachable."""


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


def _success_response(content, reasoning_content=None, model=None, usage=None):
    """Build a structured success payload."""
    return {
        "ok":               True,
        "content":          content,
        "reasoning_content": reasoning_content or "",
        "model":            model or DEFAULT_MODEL,
        "usage":            usage or {},
    }


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------
def _get_api_key():
    """Read openrouter_api_key from site_config.json."""
    key = frappe.conf.get("openrouter_api_key", "")
    if not key or not key.strip():
        return None
    return key.strip()


def _get_model():
    """Allow overriding model via site_config."""
    return frappe.conf.get("openrouter_model", DEFAULT_MODEL)


def _get_max_tokens():
    """Allow overriding max_tokens via site_config."""
    return int(frappe.conf.get("openrouter_max_tokens", DEFAULT_MAX_TOKENS))


# ---------------------------------------------------------------------------
# Message builder
# ---------------------------------------------------------------------------
def _build_messages(history, latest_message):
    """
    Assemble the messages array for the OpenRouter API call.

    Layout:
        [system] + [history (capped)] + [latest user message]

    history items are expected as:
        { "role": "user"|"assistant", "content": "..." }

    Attachments are text-only references (images are Frappe file URLs;
    we don't send binary data to the LLM in this version).
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Sanitise and cap history
    valid_roles = {"user", "assistant"}
    clean_history = []
    for item in (history or []):
        role = item.get("role", "")
        content = item.get("content", "")
        if role in valid_roles and isinstance(content, str):
            clean_history.append({"role": role, "content": content.strip()})

    # Keep only the last N messages to stay within context limits
    if len(clean_history) > MAX_HISTORY_MESSAGES:
        clean_history = clean_history[-MAX_HISTORY_MESSAGES:]

    messages.extend(clean_history)
    messages.append({"role": "user", "content": latest_message.strip()})
    return messages


# ---------------------------------------------------------------------------
# OpenRouter call (server-side streaming consumed, full payload returned)
# ---------------------------------------------------------------------------
def _call_openrouter(api_key, messages, model, max_tokens):
    """
    Call OpenRouter with stream=True.
    Consume all SSE chunks server-side and return the assembled response.

    Returns a dict:
        {
            "content":          str,
            "reasoning_content": str,
            "model":            str,
            "usage":            dict,
        }

    Raises RuntimeError with a structured error dict on failure.
    """
    headers = {
        "Authorization":  f"Bearer {api_key}",
        "Content-Type":   "application/json",
        "HTTP-Referer":   frappe.utils.get_url(),       # required by OpenRouter
        "X-Title":        "Frappe AI Assistant",
    }

    payload = {
        "model":      model,
        "messages":   messages,
        "max_tokens": max_tokens,
        "stream":     True,
    }

    try:
        response = requests.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            stream=True,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        frappe.log_error(
            title="AI Assistant: OpenRouter Timeout",
            message=f"Request timed out after {REQUEST_TIMEOUT}s"
        )
        raise RuntimeError(json.dumps({
            "code":    ApiError.TIMEOUT,
            "message": f"The AI is taking too long to respond. Please try again."
        }))
    except requests.exceptions.ConnectionError as e:
        frappe.log_error(
            title="AI Assistant: Network Error",
            message=str(e)
        )
        raise RuntimeError(json.dumps({
            "code":    ApiError.NETWORK,
            "message": "Could not reach the AI service. Check your internet connection."
        }))

    # Handle HTTP-level errors
    if response.status_code == 401:
        frappe.log_error(
            title="AI Assistant: Invalid API Key",
            message=f"OpenRouter returned 401. Check openrouter_api_key in site_config."
        )
        raise RuntimeError(json.dumps({
            "code":    ApiError.INVALID_KEY,
            "message": "The AI API key is invalid or expired. Please contact your administrator."
        }))

    if response.status_code == 429:
        frappe.log_error(
            title="AI Assistant: Rate Limited",
            message="OpenRouter returned 429."
        )
        raise RuntimeError(json.dumps({
            "code":    ApiError.RATE_LIMITED,
            "message": f"The AI service is currently rate-limited. Please wait {RETRY_WAIT_SECONDS}s and try again."
        }))

    if response.status_code >= 500:
        frappe.log_error(
            title="AI Assistant: Upstream Error",
            message=f"OpenRouter returned {response.status_code}: {response.text[:500]}"
        )
        raise RuntimeError(json.dumps({
            "code":    ApiError.UPSTREAM,
            "message": "The AI service is experiencing issues. Please try again shortly."
        }))

    if response.status_code != 200:
        frappe.log_error(
            title="AI Assistant: Unexpected HTTP Status",
            message=f"Status {response.status_code}: {response.text[:500]}"
        )
        raise RuntimeError(json.dumps({
            "code":    ApiError.UPSTREAM,
            "message": f"Unexpected response from AI service (HTTP {response.status_code})."
        }))

    # Consume SSE stream
    content_parts          = []
    reasoning_parts        = []
    finish_reason          = None
    usage                  = {}
    actual_model           = model

    try:
        for raw_line in response.iter_lines():
            if not raw_line:
                continue

            line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line

            if not line.startswith("data:"):
                continue

            data_str = line[5:].strip()

            if data_str == "[DONE]":
                break

            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            # Extract model from first chunk
            if "model" in chunk:
                actual_model = chunk["model"]

            # Usage info (may appear in last chunk)
            if "usage" in chunk and chunk["usage"]:
                usage = chunk["usage"]

            choices = chunk.get("choices", [])
            if not choices:
                continue

            delta = choices[0].get("delta", {})
            finish_reason = choices[0].get("finish_reason") or finish_reason

            # Regular content
            chunk_content = delta.get("content") or ""
            if chunk_content:
                content_parts.append(chunk_content)

            # DeepSeek reasoning_content (present in R1 models)
            chunk_reasoning = delta.get("reasoning_content") or ""
            if chunk_reasoning:
                reasoning_parts.append(chunk_reasoning)

    except Exception as e:
        frappe.log_error(
            title="AI Assistant: Stream Parsing Error",
            message=str(e)
        )
        raise RuntimeError(json.dumps({
            "code":    ApiError.MALFORMED,
            "message": "Received an unexpected response format from the AI service."
        }))

    content          = "".join(content_parts).strip()
    reasoning_content = "".join(reasoning_parts).strip()

    if not content and not reasoning_content:
        frappe.log_error(
            title="AI Assistant: Empty Response",
            message=f"Model: {actual_model}, finish_reason: {finish_reason}"
        )
        raise RuntimeError(json.dumps({
            "code":    ApiError.EMPTY_RESPONSE,
            "message": "The AI returned an empty response. Please try rephrasing your message."
        }))

    return {
        "content":           content,
        "reasoning_content": reasoning_content,
        "model":             actual_model,
        "usage":             usage,
    }


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
            "usage":            {...}
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

        # ---- API key check ----
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

        # ---- Build messages ----
        try:
            model      = _get_model()
            max_tokens = _get_max_tokens()
            messages   = _build_messages(parsed_history, message)
        except Exception as e:
            frappe.log_error(title="AI Chat API: Config/Message Build Error", message=str(e))
            return _error_response(ApiError.UPSTREAM, f"Error: {str(e)}", status_code=502)

        # ---- Call OpenRouter ----
        try:
            result = _call_openrouter(api_key, messages, model, max_tokens)
        except RuntimeError as e:
            try:
                err = json.loads(str(e))
                return _error_response(err["code"], err["message"], status_code=502)
            except Exception:
                return _error_response(ApiError.UPSTREAM, "An unexpected error occurred.", status_code=502)

        return _success_response(
            content=result["content"],
            reasoning_content=result["reasoning_content"],
            model=result["model"],
            usage=result["usage"],
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