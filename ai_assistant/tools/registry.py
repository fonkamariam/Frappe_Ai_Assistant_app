"""
tools/registry.py
-----------------
Tool Registry — central management of available tools for the agent.
Handles tool registration, schema generation, validation, and execution.
"""

import json
import frappe
from typing import Any, Callable, Dict, List, Optional


class Tool:
    """Base class for all agent tools."""
    
    def __init__(self, name: str, description: str, schema: Dict[str, Any]):
        """
        Args:
            name: Unique tool identifier (e.g., "generate_profit_loss_report")
            description: Human-readable description for the model
            schema: JSON schema describing parameters
        """
        self.name = name
        self.description = description
        self.schema = schema
    
    def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute the tool with given parameters. Must return structured output."""
        raise NotImplementedError(f"{self.__class__.__name__}.execute() not implemented")
    
    def to_openai_schema(self) -> Dict[str, Any]:
        """Convert to OpenAI tool calling schema."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.schema
            }
        }


class ToolRegistry:
    """
    Central registry for all available tools.
    Manages tool registration, schema generation, and execution.
    """
    
    def __init__(self):
        self._tools: Dict[str, Tool] = {}
    
    def register(self, tool: Tool) -> None:
        """Register a tool."""
        if tool.name in self._tools:
            frappe.log_error(
                title="Tool Registry: Duplicate tool",
                message=f"Tool '{tool.name}' already registered"
            )
            return
        self._tools[tool.name] = tool
        frappe.logger().info(f"Tool registered: {tool.name}")
    
    def get(self, name: str) -> Optional[Tool]:
        """Get a tool by name."""
        return self._tools.get(name)
    
    def list_all(self) -> List[str]:
        """List all registered tool names."""
        return list(self._tools.keys())
    
    def get_schemas(self) -> List[Dict[str, Any]]:
        """Get OpenAI tool calling schemas for all tools."""
        return [tool.to_openai_schema() for tool in self._tools.values()]
    
    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a tool by name with given parameters.
        
        Returns:
            {
                "success": bool,
                "data": Any,           # Result data if success=True
                "error": str,          # Error message if success=False
                "tool_name": str
            }
        """
        tool = self.get(tool_name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool '{tool_name}' not found",
                "tool_name": tool_name
            }
        
        try:
            result = tool.execute(**tool_input)
            return {
                "success": True,
                "data": result,
                "tool_name": tool_name
            }
        except Exception as e:
            frappe.log_error(
                title=f"Tool Execution Error: {tool_name}",
                message=str(e)
            )
            return {
                "success": False,
                "error": str(e),
                "tool_name": tool_name
            }


# Global registry instance
_registry: Optional[ToolRegistry] = None


def get_registry() -> ToolRegistry:
    """
    Lazy-initialize and return the global tool registry.
    Automatically registers all built-in tools.
    """
    global _registry
    
    if _registry is None:
        _registry = ToolRegistry()
        _initialize_tools(_registry)
    
    return _registry


def _initialize_tools(registry: ToolRegistry) -> None:
    """Register all built-in tools."""
    from .finance import ProfitLossReportTool
    from .customers import TopCustomersTool
    from .invoices import OutstandingInvoicesTool
    from .employees import EmployeeSummaryTool
    
    registry.register(ProfitLossReportTool())
    registry.register(TopCustomersTool())
    registry.register(OutstandingInvoicesTool())
    registry.register(EmployeeSummaryTool())