---
'owox': minor
---

# Join descriptions can now say something different per join path

A join description explains what pulling in another data mart actually means — business users read it in the report column picker, and AI assistants read it over MCP. It was written once on the relationship itself, so every data mart that reached that join showed the same sentence. "Orders placed by this customer" is right in a Customers data mart, but in a Companies data mart that reaches Orders through Customers it explains nothing.

The Description tab of an inherited join is now editable. The inherited text stays visible as a placeholder, and whatever you type applies to that join path only — the relationship itself, and every other data mart that inherits it, keep their own wording. Clearing the field, or the new **Reset to inherited** button, falls back to the inherited description.

Nothing changes until someone types: a join with no description of its own behaves exactly as before. Wherever a description is shown — the join-path tooltip in the report column picker, and `joins[]` in the MCP data mart details — it is the one that applies to that particular path.
