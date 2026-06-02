"""
tools/customers.py
------------------
Customer-related tools for the AI Agent.
Implements: get_top_customers
"""

import frappe
from datetime import datetime
from typing import Any, Dict, Optional, List
from .registry import Tool


class TopCustomersTool(Tool):
    """Get the top customers by total invoice amount."""
    
    def __init__(self):
        schema = {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of top customers to return (default: 10)",
                    "default": 10
                },
                "from_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format (optional)"
                },
                "to_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format (optional)"
                }
            },
            "required": [],
            "additionalProperties": False
        }
        
        super().__init__(
            name="get_top_customers",
            description="Get the top customers by total invoice amount. Use this when the user asks about best customers, highest spending customers, top clients, most valuable customers, or customer revenue breakdown.",
            schema=schema
        )
    
    def execute(self, limit: int = 10, from_date: Optional[str] = None, to_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Get top customers by invoice amount.
        
        Returns:
            {
                "success": bool,
                "data": List[{
                    "customer": str,
                    "total_amount": float,
                    "invoice_count": int,
                    "currency": str
                }],
                "date_range": {"from": str, "to": str}
            }
        """
        try:
            # Parse dates
            to_date_dt = self._parse_date(to_date) or datetime.now().date()
            from_date_dt = self._parse_date(from_date) or datetime(to_date_dt.year, 1, 1).date()
            
            # Build query filters
            filters = [
                ["Sales Invoice", "docstatus", "=", 1],  # submitted only
                ["Sales Invoice", "posting_date", "between", [from_date_dt, to_date_dt]]
            ]
            
            # Get sales invoices
            invoices = frappe.db.get_list(
                "Sales Invoice",
                filters=filters,
                fields=["customer", "grand_total", "currency"],
                limit_page_length=None
            )
            
            # Aggregate by customer
            customer_totals = {}
            for invoice in invoices:
                customer = invoice.get("customer")
                if not customer:
                    continue
                
                if customer not in customer_totals:
                    customer_totals[customer] = {
                        "total_amount": 0,
                        "invoice_count": 0,
                        "currency": invoice.get("currency", "USD")
                    }
                
                customer_totals[customer]["total_amount"] += invoice.get("grand_total", 0) or 0
                customer_totals[customer]["invoice_count"] += 1
            
            # Sort by total amount and limit
            sorted_customers = sorted(
                [
                    {
                        "customer": cust,
                        "total_amount": round(data["total_amount"], 2),
                        "invoice_count": data["invoice_count"],
                        "currency": data["currency"]
                    }
                    for cust, data in customer_totals.items()
                ],
                key=lambda x: x["total_amount"],
                reverse=True
            )[:limit]
            
            return {
                "success": True,
                "data": sorted_customers,
                "date_range": {
                    "from": str(from_date_dt),
                    "to": str(to_date_dt)
                }
            }
        
        except Exception as e:
            frappe.log_error(
                title="TopCustomersTool Error",
                message=str(e)
            )
            raise
    
    @staticmethod
    def _parse_date(date_str: Optional[str]) -> Optional[object]:
        """Parse date string in YYYY-MM-DD format."""
        if not date_str:
            return None
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError(f"Invalid date format: {date_str}. Use YYYY-MM-DD")
