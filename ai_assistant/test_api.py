import frappe

@frappe.whitelist()
def test():
    return {"ok": True, "message": "API is working"}
