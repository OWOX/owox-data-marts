---
'owox': minor
---

# Typing in the SQL editor now works reliably on saved Data Marts

On any saved Data Mart, the SQL Query editor could refuse to insert spaces: you would type `select * from`, press the spacebar, and nothing would appear. This happened whenever the Joinable Data Marts section was set to the diagram view — the diagram was silently capturing the spacebar for itself. The editor now always receives everything you type, regardless of how the Joinable Data Marts section is displayed.

Two more editing annoyances are gone as well:

- A query you were still writing no longer disappears when the page refreshes its data in the background (for example, right after saving, publishing, or updating the output schema).
- After picking a different input source type, the Save button no longer stays greyed out while a valid query is on screen.
