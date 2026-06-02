"""
tools/finance.py
----------------
Finance module tools for the AI Agent.
Currently implements: generate_profit_loss_report
"""

import frappe
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from .registry import Tool


class ProfitLossReportTool(Tool):
    """
    Generate Profit & Loss report for a given company and date range.
    Uses ERPNext's financial data to prevent hallucinated numbers.
    """
    
    def __init__(self):
        schema = {
            "type": "object",
            "properties": {
                "company": {
                    "type": "string",
                    "description": "Company name (e.g., 'Acme Inc'). If not provided, uses default company."
                },
                "from_date": {
                    "type": "string",
                    "description": "Start date in YYYY-MM-DD format. If not provided, uses start of current fiscal year."
                },
                "to_date": {
                    "type": "string",
                    "description": "End date in YYYY-MM-DD format. If not provided, uses today's date."
                }
            },
            "required": [],
            "additionalProperties": False
        }
        
        super().__init__(
            name="generate_profit_loss_report",
            description="Generate a Profit & Loss (Income Statement) report for a company. Returns revenue, expenses, and net profit/loss for the specified period.",
            schema=schema
        )
    
    def execute(self, company: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute P&L report generation.
        
        Returns:
            {
                "company": str,
                "from_date": str,
                "to_date": str,
                "revenue": float,
                "cost_of_goods_sold": float,
                "gross_profit": float,
                "operating_expenses": float,
                "operating_profit": float,
                "net_profit": float,
                "currency": str,
                "data_source": "ERPNext"
            }
        """
        # Get company
        company = company or frappe.defaults.get_user_default("company")
        if not company:
            raise ValueError("No company specified and no default company set")
        
        # Validate company exists
        if not frappe.db.exists("Company", company):
            raise ValueError(f"Company '{company}' does not exist")
        
        # Parse dates
        to_date_dt = self._parse_date(to_date) or datetime.now().date()
        from_date_dt = self._parse_date(from_date) or self._get_fiscal_year_start(company, to_date_dt)
        
        # Fetch GL entries
        gl_entries = frappe.db.get_list(
            "GL Entry",
            filters={
                "company": company,
                "posting_date": ["between", [from_date_dt, to_date_dt]],
                "is_cancelled": 0
            },
            fields=["account", "debit", "credit"],
            limit_page_length=None
        )
        
        # Aggregate by account
        accounts = {}
        for entry in gl_entries:
            acc = entry["account"]
            if acc not in accounts:
                accounts[acc] = {"debit": 0, "credit": 0}
            accounts[acc]["debit"] += entry.get("debit", 0) or 0
            accounts[acc]["credit"] += entry.get("credit", 0) or 0
        
        # Get account types
        account_types = {}
        for acc in accounts.keys():
            acc_doc = frappe.db.get_value("Account", acc, "account_type")
            if acc_doc:
                account_types[acc] = acc_doc[0] if isinstance(acc_doc, tuple) else acc_doc
        
        # Categorize accounts
        revenue = 0.0
        cogs = 0.0
        opex = 0.0
        
        for acc, amounts in accounts.items():
            net_amount = (amounts["credit"] - amounts["debit"])
            acc_type = account_types.get(acc, "").lower()
            
            # Revenue accounts typically use credit
            if "income" in acc_type or "revenue" in acc_type:
                revenue += net_amount
            # COGS typically uses debit
            elif "cost of goods sold" in acc_type or "cogs" in acc_type:
                cogs += abs(net_amount)
            # Expense accounts
            elif "expense" in acc_type:
                opex += abs(net_amount)
        
        # Calculate P&L
        gross_profit = revenue - cogs
        operating_profit = gross_profit - opex
        net_profit = operating_profit  # Simplified; real implementation would include other income/expenses
        
        # Get currency
        currency = frappe.db.get_value("Company", company, "default_currency")
        if isinstance(currency, tuple):
            currency = currency[0] if currency else "USD"
        
        return {
            "company": company,
            "from_date": str(from_date_dt),
            "to_date": str(to_date_dt),
            "revenue": round(revenue, 2),
            "cost_of_goods_sold": round(cogs, 2),
            "gross_profit": round(gross_profit, 2),
            "operating_expenses": round(opex, 2),
            "operating_profit": round(operating_profit, 2),
            "net_profit": round(net_profit, 2),
            "currency": currency,
            "data_source": "ERPNext"
        }
    
    @staticmethod
    def _parse_date(date_str: Optional[str]) -> Optional[object]:
        """Parse date string in YYYY-MM-DD format."""
        if not date_str:
            return None
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError(f"Invalid date format: {date_str}. Use YYYY-MM-DD")
    
    @staticmethod
    def _get_fiscal_year_start(company: str, reference_date: object) -> object:
        """Get fiscal year start date for the company."""
        # Get fiscal year settings
        fy_doc = frappe.db.get_value(
            "Fiscal Year",
            filters={"company": company, "year_start_date": ["<=", reference_date], "year_end_date": [">=", reference_date]},
            fieldname="year_start_date"
        )
        
        if fy_doc:
            return fy_doc[0] if isinstance(fy_doc, tuple) else fy_doc
        
        # Default: start of calendar year
        return reference_date.replace(month=1, day=1)
