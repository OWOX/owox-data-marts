---
'owox': minor
---

# Improve table and view selection UX by integrating picker button into input field

Improves the visual design of table pattern and fully qualified name fields by moving the storage picker button inside the input. Creates a cleaner, more compact interface that guides users through the selection flow.

- Button now appears inside the input field on the left side
- When no value selected: shows "Select..." text with database icon
- When value exists: shows compact icon-only button with "Change selection" tooltip
- External link icon appears inside input on the right side when URL available
- Focus state highlights entire input group for better visual feedback

Improved visual hierarchy and space efficiency in Data Mart definition forms. No breaking changes. No migration required
