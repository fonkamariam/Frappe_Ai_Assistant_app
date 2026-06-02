"""
ai_chat_api_simplified.py
--------------------------
UI-ONLY VERSION: Simple API proxy that forwards requests to external LLM.

This is NOT a tool-calling agent. It's a simple forwarder:
    Frontend Chat UI → This API → External LLM → Response back to UI

The external LLM (manager's backend, DeepSeek, ChatGPT, etc.) handles:
    - Tool orchestration
    - Business logic
    - Database queries
    - Everything!

This API just:
    - Validates input
    - Forwards to external LLM
    - Returns response

CONFIGURATION:
    Add to your site_config.json:
    
    "ai_api_url": "https://openrouter.ai/api/v1/chat/completions",
    "ai_api_key": "sk-or-v1-YOUR_KEY",
    "ai_model": "deepseek/deepseek-r1-distill-llama-70b"
    
    WHEN MANAGER GIVES YOU THEIR API:
    Just update these 3 values. No code changes needed!
"""

import json
import frappe
import requests
from .llm_config import get_llm_config, validate_config

# Max size limits
MAX_MESSAGE_LENGTH = 32000
MAX_HISTORY_LENGTH = 20
REQUEST_TIMEOUT = 360  # seconds


def _error_response(error_code, message, status_code=400):
    """Return a standardized error response."""
    return {
        "ok": False,
        "error": error_code,
        "message": message,
        "status_code": status_code
    }


def _success_response(content, model=None, usage=None):
    """Return a standardized success response."""
    return {
        "ok": True,
        "content": content,
        "model": model or "unknown",
        "usage": usage or {},
    }


@frappe.whitelist()
def send_message(message, history=None):
    """
    POST /api/method/ai_assistant.ai_chat_api.send_message
    
    Forward the user's message to the external LLM API and return the response.
    
    Parameters:
        message (str) - User's chat message
        history (str) - JSON-encoded conversation history
    
    Returns:
        {
            "ok": true,
            "content": "AI response text",
            "model": "model-name",
            "usage": {...}
        }
    
    Or on error:
        {
            "ok": false,
            "error": "ERROR_CODE",
            "message": "Human-readable error"
        }
    """
    
    try:
        # ---- Validate Input ----
        if not message or not isinstance(message, str) or not message.strip():
            return _error_response("INVALID_MESSAGE", "Message cannot be empty.")
        
        if len(message) > MAX_MESSAGE_LENGTH:
            return _error_response("MESSAGE_TOO_LONG", f"Message exceeds {MAX_MESSAGE_LENGTH} characters.")
        
        # ---- Validate Configuration ----
        try:
            validate_config()
        except frappe.ValidationError as e:
            frappe.log_error(title="AI Chat Config Error", message=str(e))
            return _error_response("CONFIG_ERROR", str(e), 503)
        
        # ---- Parse History ----
        parsed_history = []
        if history:
            try:
                if isinstance(history, str):
                    parsed_history = json.loads(history)
                elif isinstance(history, list):
                    parsed_history = history
            except (json.JSONDecodeError, TypeError) as e:
                return _error_response("INVALID_HISTORY", "Invalid conversation history format.")
        
        # Cap history to prevent huge payloads
        if len(parsed_history) > MAX_HISTORY_LENGTH:
            parsed_history = parsed_history[-MAX_HISTORY_LENGTH:]
        
        # ---- Build request to external LLM ----
        config = get_llm_config()
        
        # Build messages for the LLM
        messages = parsed_history.copy() if parsed_history else []
        messages.append({
            "role": "user",
            "content": message.strip()
        })
        
        # Prepare request payload (standard OpenAI format)
        payload = {
            "model": config['model'],
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2048,
        }
        
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
        }
        
        # ---- Call external LLM ----
        try:
            frappe.logger().info(f"Calling LLM API: {config['api_url']}")
            
            response = requests.post(
                config['api_url'],
                json=payload,
                headers=headers,
                timeout=REQUEST_TIMEOUT
            )
            
            response.raise_for_status()
            
        except requests.exceptions.Timeout:
            frappe.log_error(title="AI Chat API Timeout", message=f"LLM API timeout after {REQUEST_TIMEOUT}s")
            return _error_response("TIMEOUT", "Request timed out. Please try again.", 504)
        
        except requests.exceptions.ConnectionError as e:
            frappe.log_error(title="AI Chat Connection Error", message=str(e))
            return _error_response("CONNECTION_ERROR", "Cannot connect to AI service.", 503)
        
        except requests.exceptions.HTTPError as e:
            error_msg = f"LLM API returned {response.status_code}"
            frappe.log_error(title="AI Chat API Error", message=error_msg)
            
            # Try to extract error details from response
            try:
                error_detail = response.json().get("error", {}).get("message", "Unknown error")
                return _error_response("LLM_ERROR", f"AI service error: {error_detail}", 502)
            except:
                return _error_response("LLM_ERROR", error_msg, 502)
        
        except Exception as e:
            frappe.log_error(title="AI Chat Unexpected Error", message=str(e))
            return _error_response("API_ERROR", "An unexpected error occurred.", 500)
        
        # ---- Parse response from external LLM ----
        try:
            response_data = response.json()
        except json.JSONDecodeError:
            frappe.log_error(title="AI Chat Invalid JSON Response", message=response.text)
            return _error_response("INVALID_RESPONSE", "Received invalid response from AI service.", 502)
        
        # ---- Extract content (standard OpenAI format) ----
        try:
            # Standard OpenAI format
            content = response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            if not content:
                frappe.log_error(title="AI Chat Empty Response", message=f"Response: {response_data}")
                return _error_response("EMPTY_RESPONSE", "AI service returned empty response.", 502)
            
            usage = response_data.get("usage", {})
            model = config['model']
            
            return _success_response(content, model, usage)
        
        except (KeyError, IndexError, TypeError) as e:
            frappe.log_error(title="AI Chat Response Parsing Error", message=f"Could not parse response: {response_data}")
            return _error_response("PARSE_ERROR", "Could not parse response from AI service.", 502)
    
    except Exception as e:
        frappe.log_error(title="AI Chat Unexpected Error", message=str(e))
        return _error_response("INTERNAL_ERROR", "An unexpected error occurred.", 500)
