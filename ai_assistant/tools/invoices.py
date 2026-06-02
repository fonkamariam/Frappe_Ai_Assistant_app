"""
tools/invoices.py
-----------------
Invoice-related tools for the AI Agent.
Implements: get_outstanding_invoices
"""

import frappe
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, List
from .registry import Tool


class OutstandingInvoicesTool(Tool):
    """Get all unpaid or partially paid invoices with aging information."""
    
    def __init__(self):
        schema = {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string",
                    "description": "Filter by specific customer name (optional)"
                },
                "days_overdue": {
                    "type": "integer",
                    "description": "Only return invoices overdue by at least this many days (optional)"
                }
            },
            "required": [],
            "additionalProperties": False
        }
        
        super().__init__(
            name="get_outstanding_invoices",
            description="Get all unpaid or partially paid invoices. Use this when user asks about outstanding invoices, unpaid bills, what customers owe us, accounts receivable, overdue payments, or pending collections.",
            schema=schema
        )
    
    def execute(self, customer: Optional[str] = None, days_overdue: Optional[int] = None) -> Dict[str, Any]:
        """
        Get outstanding invoices with aging.
        
        Returns:
            {
                "success": bool,
                "data": List[{
                    "name": str,
                    "customer": str,
                    "grand_total": float,
                    "outstanding_amount": float,
                    "due_date": str,
                    "days_overdue": int,
                    "status": str,
                    "currency": str
                }],
                "total_outstanding": float,
                "currency": str,
                "filter_applied": str
            }
        """
        try:
            # Build query filters
            filters = [
                ["Sales Invoice", "docstatus", "=", 1],  # submitted only
                ["Sales Invoice", "outstanding_amount", ">", 0]
            ]
            
            if customer:
                filters.append(["Sales Invoice", "customer", "=", customer])
            
            # Get outstanding invoices
            invoices = frappe.db.get_list(
                "Sales Invoice",
                filters=filters,
                fields=["name", "customer", "grand_total", "outstanding_amount", "due_date", "currency"],
                limit_page_length=None
            )
            
            today = datetime.now().date()
            results = []
            total_outstanding = 0
            
            for invoice in invoices:
                due_date_str = invoice.get("due_date")
                due_date = self._parse_date(due_date_str) if due_date_str else None
                
                days_overdue_val = 0
                if due_date:
                    days_overdue_val = (today - due_date).days
                
                # Filter by days_overdue if specified
                if days_overdue is not None and days_overdue_val < days_overdue:
                    continue
                
                outstanding = invoice.get("outstanding_amount", 0) or 0
                total_outstanding += outstanding
                
                # Determine status
                if outstanding >= invoice.get("grand_total", 1):
                    status = "Unpaid"
                else:
                    status = "Partially Paid"
                
                results.append({
                    "name": invoice.get("name"),
                    "customer": invoice.get("customer"),
                    "grand_total": round(invoice.get("grand_total", 0) or 0, 2),
                    "outstanding_amount": round(outstanding, 2),
                    "due_date": due_date_str or "Not set",
                    "days_overdue": max(0, days_overdue_val),
                    "status": status,
                    "currency": invoice.get("currency", "USD")
                })
            
            # Sort by days_overdue (descending)
            results.sort(key=lambda x: x["days_overdue"], reverse=True)
            
            filter_applied = "None"
            if customer:
                filter_applied = f"Customer: {customer}"
            if days_overdue is not None:
                filter_applied += f"; Days Overdue >= {days_overdue}"
            
            return {
                "success": True,
                "data": results,
                "total_outstanding": round(total_outstanding, 2),
                "currency": "USD",
                "filter_applied": filter_applied
            }
        
        except Exception as e:
            frappe.log_error(
                title="OutstandingInvoicesTool Error",
                message=str(e)
            )
            raise
    
    @staticmethod
    def _parse_date(date_str: Optional[str]) -> Optional[object]:
        """Parse date string in YYYY-MM-DD format."""
        if not date_str:
            return None
        try:
            if isinstance(date_str, datetime):
                return date_str.date()
            return datetime.strptime(str(date_str), "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None
