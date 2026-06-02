"""
tools/employees.py
------------------
Employee-related tools for the AI Agent.
Implements: get_employee_summary
"""

import frappe
from typing import Any, Dict, Optional, List
from .registry import Tool


class EmployeeSummaryTool(Tool):
    """Get a summary of employees by department, status, or designation."""
    
    def __init__(self):
        schema = {
            "type": "object",
            "properties": {
                "department": {
                    "type": "string",
                    "description": "Filter by department name (optional)"
                },
                "status": {
                    "type": "string",
                    "description": "Filter by status: Active, Inactive, Left, On Leave (optional)"
                }
            },
            "required": [],
            "additionalProperties": False
        }
        
        super().__init__(
            name="get_employee_summary",
            description="Get a summary of employees by department, status, or designation. Use this when user asks about headcount, how many employees, staff summary, workforce overview, department breakdown, or team size.",
            schema=schema
        )
    
    def execute(self, department: Optional[str] = None, status: Optional[str] = None) -> Dict[str, Any]:
        """
        Get employee summary with department and status breakdown.
        
        Returns:
            {
                "success": bool,
                "total_employees": int,
                "by_department": {dept_name: count, ...},
                "by_status": {status: count, ...},
                "employees": List[{
                    "name": str,
                    "employee_name": str,
                    "department": str,
                    "designation": str,
                    "status": str
                }],
                "filters_applied": str
            }
        """
        try:
            # Build query filters
            filters = []
            
            if department:
                filters.append(["Employee", "department", "=", department])
            
            if status:
                filters.append(["Employee", "status", "=", status])
            
            # Get employees
            employees = frappe.db.get_list(
                "Employee",
                filters=filters if filters else None,
                fields=["name", "employee_name", "department", "designation", "status"],
                limit_page_length=None
            )
            
            # Aggregate by department and status
            by_department = {}
            by_status = {}
            
            employee_list = []
            for emp in employees:
                dept = emp.get("department", "Unassigned")
                emp_status = emp.get("status", "Active")
                
                # Count by department
                if dept not in by_department:
                    by_department[dept] = 0
                by_department[dept] += 1
                
                # Count by status
                if emp_status not in by_status:
                    by_status[emp_status] = 0
                by_status[emp_status] += 1
                
                # Add to employee list
                employee_list.append({
                    "name": emp.get("name"),
                    "employee_name": emp.get("employee_name"),
                    "department": dept,
                    "designation": emp.get("designation", "Not set"),
                    "status": emp_status
                })
            
            filters_applied = "None"
            if department or status:
                parts = []
                if department:
                    parts.append(f"Department: {department}")
                if status:
                    parts.append(f"Status: {status}")
                filters_applied = "; ".join(parts)
            
            return {
                "success": True,
                "total_employees": len(employees),
                "by_department": by_department,
                "by_status": by_status,
                "employees": employee_list,
                "filters_applied": filters_applied
            }
        
        except Exception as e:
            frappe.log_error(
                title="EmployeeSummaryTool Error",
                message=str(e)
            )
            raise
