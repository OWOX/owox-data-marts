---
'owox': minor
---

# Fix empty error text for invalid storage status

When storage access validation fails and the backend response doesn't include an error message, the UI now shows "Access validation failed" instead of rendering a blank space next to the warning icon.
