"""
agent.py
--------
Tool-calling Agent loop.
Orchestrates the conversation between user, model, and tools.
"""

import json
import frappe
import requests
from typing import Any, Dict, List, Optional
from datetime import datetime


class AgentMessage:
    """Represents a message in the agent conversation."""
    
    ROLE_USER = "user"
    ROLE_ASSISTANT = "assistant"
    ROLE_TOOL = "tool"
    
    def __init__(self, role: str, content: str = "", tool_calls: Optional[List[Dict]] = None, tool_call_id: Optional[str] = None):
        self.role = role
        self.content = content
        self.tool_calls = tool_calls or []
        self.tool_call_id = tool_call_id
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to OpenAI chat format."""
        msg = {"role": self.role, "content": self.content}
        if self.tool_calls:
            msg["tool_calls"] = self.tool_calls
        if self.tool_call_id:
            msg["tool_call_id"] = self.tool_call_id
        return msg


class Agent:
    """
    Tool-calling Agent that orchestrates the agentic loop.
    Handles tool-call detection, execution, and result processing.
    """
    
    MAX_TOOL_ITERATIONS = 5  # Prevent infinite loops
    
    def __init__(self, model: str, api_key: str, tools_registry, provider: str = "ollama"):
        self.model = model
        self.api_key = api_key
        self.tools_registry = tools_registry
        self.provider = provider.lower()
        
        # Set API endpoint based on provider
        if self.provider == "openrouter":
            self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        else:
            # Ollama on Linux - use actual host IP
            # Primary: Your host machine IP (works from Docker on Linux)
            # Fallback: host.docker.internal (Docker Desktop only)
            self.api_url = "http://192.168.8.158:11434/v1/chat/completions"
            self.api_url_fallback = "http://host.docker.internal:11434/v1/chat/completions"
    
    def run(self, user_message: str, history: List[Dict[str, Any]], max_tokens: int = 4096) -> Dict[str, Any]:
        """
        Run the agent loop.
        
        Returns:
            {
                "content": str,
                "reasoning_content": str,
                "tool_calls": List[Dict],  # Executed tool calls
                "model": str,
                "usage": Dict,
                "data_source": str  # "ERPNext" if tools were used, "Model" otherwise
            }
        """
        messages = self._build_initial_messages(user_message, history)
        tool_calls_executed = []
        data_source = "Model"  # Default - will change to "ERPNext" if tools used
        
        for iteration in range(self.MAX_TOOL_ITERATIONS):
            frappe.logger().info(f"Agent iteration {iteration + 1}/{self.MAX_TOOL_ITERATIONS}")
            
            # Call model with tools
            response = self._call_model(messages, max_tokens)
            
            if not response.get("ok"):
                return response
            
            content = response.get("content", "")
            reasoning_content = response.get("reasoning_content", "")
            model = response.get("model", self.model)
            usage = response.get("usage", {})
            
            # Extract assistant message and tool calls
            assistant_msg = response.get("assistant_message", {})
            tool_calls = assistant_msg.get("tool_calls", [])
            
            # If no tool calls, we're done
            if not tool_calls:
                return {
                    "ok": True,
                    "content": content,
                    "reasoning_content": reasoning_content,
                    "tool_calls": tool_calls_executed,
                    "model": model,
                    "usage": usage,
                    "data_source": data_source
                }
            
            # Add assistant response to messages
            messages.append(assistant_msg)
            
            # Execute tools
            tool_results = []
            for tool_call in tool_calls:
                tool_name = tool_call.get("function", {}).get("name", "unknown")
                frappe.logger().info(f"Executing tool: {tool_name}")
                
                result = self._execute_tool_call(tool_call)
                tool_results.append(result)
                tool_calls_executed.append({
                    "tool_name": tool_name,
                    "input": tool_call.get("function", {}).get("arguments"),
                    "result": result
                })
                
                # Log the result
                frappe.logger().info(f"Tool {tool_name} result: {str(result)[:200]}")
                
                # Mark that we used ERPNext data
                if result.get("success"):
                    data_source = "ERPNext"
            
            # Add tool results to messages
            for tool_call, tool_result in zip(tool_calls, tool_results):
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.get("id"),
                    "content": json.dumps(tool_result)
                })
        
        # Max iterations reached
        return {
            "ok": True,
            "content": "Agent reached maximum tool iterations. Please try again.",
            "reasoning_content": "",
            "tool_calls": tool_calls_executed,
            "model": model,
            "usage": {},
            "data_source": data_source
        }
    
    def _build_initial_messages(self, user_message: str, history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Build the initial message list with system prompt."""
        system_prompt = self._get_system_prompt()
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add history (capped)
        max_history = 20
        clean_history = []
        for item in (history or []):
            role = item.get("role", "")
            if role in ["user", "assistant"]:
                # Skip tool calls from history (we'll re-execute)
                content = item.get("content", "")
                if isinstance(content, str) and content.strip():
                    clean_history.append({"role": role, "content": content.strip()})
        
        if len(clean_history) > max_history:
            clean_history = clean_history[-max_history:]
        
        messages.extend(clean_history)
        messages.append({"role": "user", "content": user_message.strip()})
        
        return messages
    
    def _get_system_prompt(self) -> str:
        """Get the system prompt with tool instructions."""
        tool_names = ", ".join(self.tools_registry.list_all())
        
        return f"""You are a helpful, knowledgeable AI assistant embedded in an ERPNext/Frappe environment.
You provide clear, accurate, and concise answers.

You have access to the following tools to assist users:
{tool_names}

When a user requests information that can be fetched from tools, use the appropriate tool to retrieve real data.
Never make up financial or business data - always use tool calls to fetch accurate information from the system.
When reasoning through a problem, think step by step.
Be professional but approachable.

For financial queries, always use the generate_profit_loss_report tool to get accurate P&L data."""

    def _call_model(self, messages: List[Dict[str, Any]], max_tokens: int) -> Dict[str, Any]:
        """
        Call the model (OpenRouter or Ollama) with tools.
        
        Returns the raw response dict plus processed fields:
            {
                "ok": bool,
                "content": str,
                "reasoning_content": str,
                "assistant_message": Dict,
                "model": str,
                "usage": Dict,
                "error": str (if ok=False)
            }
        """
        # Build headers based on provider
        headers = {"Content-Type": "application/json"}
        
        if self.provider == "openrouter":
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["HTTP-Referer"] = frappe.utils.get_url()
            headers["X-Title"] = "Frappe AI Assistant"
        
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": False
        }
        
        # Enable tool calling for both providers
        tools_schemas = self.tools_registry.get_schemas()
        if tools_schemas:
            payload["tools"] = tools_schemas
            payload["tool_choice"] = "auto"
        
        try:
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=120
            )
        except requests.exceptions.ConnectionError as e:
            # If Ollama and primary endpoint fails, try fallback
            if self.provider == "ollama" and hasattr(self, 'api_url_fallback'):
                frappe.logger().warning(f"Primary Ollama endpoint failed, trying fallback: {self.api_url_fallback}")
                try:
                    response = requests.post(
                        self.api_url_fallback,
                        headers=headers,
                        json=payload,
                        timeout=120
                    )
                except Exception as fallback_error:
                    frappe.log_error(
                        title="Agent: Ollama Connection Failed (both endpoints)",
                        message=f"Primary: {str(e)}\nFallback: {str(fallback_error)}"
                    )
                    return {
                        "ok": False,
                        "error": "NETWORK_ERROR",
                        "message": f"Cannot connect to Ollama. Ensure Ollama is running at http://host.docker.internal:11434"
                    }
            else:
                frappe.log_error(
                    title="Agent: Network Connection Error",
                    message=str(e)
                )
                return {
                    "ok": False,
                    "error": "NETWORK_ERROR",
                    "message": str(e)
                }
        except requests.exceptions.Timeout:
            frappe.log_error(
                title="Agent: Model Request Timeout",
                message="Request timed out after 120s"
            )
            return {
                "ok": False,
                "error": "REQUEST_TIMEOUT",
                "message": "Model request timed out"
            }
        except requests.exceptions.RequestException as e:
            frappe.log_error(
                title="Agent: Network Error",
                message=str(e)
            )
            return {
                "ok": False,
                "error": "NETWORK_ERROR",
                "message": str(e)
            }
        
        # Handle HTTP errors
        if response.status_code != 200:
            frappe.log_error(
                title=f"Agent: Model HTTP {response.status_code}",
                message=f"Status: {response.status_code}\nResponse: {response.text[:1000]}"
            )
            
            if response.status_code == 401:
                error_code = "INVALID_API_KEY"
            elif response.status_code == 429:
                error_code = "RATE_LIMITED"
            elif response.status_code >= 500:
                error_code = "UPSTREAM_ERROR"
            else:
                error_code = "HTTP_ERROR"
            
            return {
                "ok": False,
                "error": error_code,
                "message": f"Model API returned {response.status_code}"
            }
        
        try:
            data = response.json()
        except json.JSONDecodeError:
            return {
                "ok": False,
                "error": "MALFORMED_RESPONSE",
                "message": "Could not parse model response"
            }
        
        # Extract response (OpenAI-compatible format)
        choices = data.get("choices", [])
        if not choices:
            return {
                "ok": False,
                "error": "EMPTY_RESPONSE",
                "message": "Model returned no choices"
            }
        
        first_choice = choices[0]
        assistant_message = first_choice.get("message", {})
        
        # Extract content and reasoning
        content = (assistant_message.get("content") or "").strip()
        reasoning_content = self._extract_reasoning(assistant_message)
        
        # Extract tool calls if present
        tool_calls = assistant_message.get("tool_calls", [])
        
        return {
            "ok": True,
            "content": content,
            "reasoning_content": reasoning_content,
            "assistant_message": assistant_message,
            "model": data.get("model", self.model),
            "usage": data.get("usage", {}),
            "tool_calls": tool_calls
        }
    
    def _execute_tool_call(self, tool_call: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a tool call and return the result.
        
        tool_call format:
            {
                "id": "call_xxx",
                "type": "function",
                "function": {
                    "name": "tool_name",
                    "arguments": "{...}"  # JSON string
                }
            }
        """
        tool_name = tool_call.get("function", {}).get("name")
        arguments_str = tool_call.get("function", {}).get("arguments", "{}")
        
        try:
            tool_input = json.loads(arguments_str)
        except json.JSONDecodeError:
            return {
                "success": False,
                "error": "Invalid tool arguments JSON",
                "tool_name": tool_name
            }
        
        return self.tools_registry.execute_tool(tool_name, tool_input)
    
    @staticmethod
    def _extract_reasoning(message: Dict[str, Any]) -> str:
        """Extract reasoning/thinking content from assistant message."""
        # Check for DeepSeek reasoning_content
        if "reasoning_content" in message:
            return message.get("reasoning_content", "").strip()
        
        # Check for Ollama/Qwen thinking field
        if "thinking" in message:
            return message.get("thinking", "").strip()
        
        # For other models, check if content contains reasoning markers
        content = message.get("content", "")
        if content.startswith("<reasoning>"):
            # Extract reasoning block
            import re
            match = re.search(r"<reasoning>(.*?)</reasoning>", content, re.DOTALL)
            if match:
                return match.group(1).strip()
        
        return ""