"""
llm_config.py
--------------
Configuration for external LLM API endpoints.

This is the CORE of the UI-only approach:
- Stores API URL and Key in one place
- Easy to swap between providers (DeepSeek, ChatGPT, Manager's API, etc.)
- No code changes needed when switching providers

CURRENT SETUP: DeepSeek via OpenRouter
FUTURE: Manager's backend (just update URL and key)
"""

import frappe


def get_llm_config():
    """
    Fetch LLM configuration from site_config.json
    
    Returns:
        {
            'api_url': 'https://...',
            'api_key': 'key...',
            'model': 'model-name',
            'provider': 'provider-name'
        }
    """
    
    # Get config from site_config.json
    provider = frappe.conf.get("ai_provider", "openrouter").lower()
    
    # For flexibility: support both old and new config keys
    api_key = frappe.conf.get("openrouter_api_key") or frappe.conf.get("ai_api_key", "")
    api_url = frappe.conf.get("ai_api_url") or frappe.conf.get("openrouter_api_url", "https://openrouter.ai/api/v1/chat/completions")
    model = frappe.conf.get("ai_model") or frappe.conf.get("openrouter_model", "deepseek/deepseek-r1-distill-llama-70b")
    
    return {
        'provider': provider,
        'api_url': api_url,
        'api_key': api_key,
        'model': model,
    }


def validate_config():
    """
    Check if configuration is valid before making API calls
    
    Raises:
        frappe.ValidationError if config is missing/invalid
    """
    config = get_llm_config()
    
    if not config.get('api_url'):
        raise frappe.ValidationError("AI API URL is not configured. Please set 'ai_api_url' in site_config.json")
    
    if not config.get('api_key'):
        raise frappe.ValidationError("AI API Key is not configured. Please set 'ai_api_key' in site_config.json")
    
    return True
