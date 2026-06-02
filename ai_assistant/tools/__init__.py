"""
tools/__init__.py
-----------------
Tool registry and management for AI Agent tool-calling architecture.
"""

from .registry import ToolRegistry, get_registry
from .finance import ProfitLossReportTool
from .customers import TopCustomersTool
from .invoices import OutstandingInvoicesTool
from .employees import EmployeeSummaryTool

__all__ = [
    'ToolRegistry',
    'get_registry',
    'ProfitLossReportTool',
    'TopCustomersTool',
    'OutstandingInvoicesTool',
    'EmployeeSummaryTool',
]
