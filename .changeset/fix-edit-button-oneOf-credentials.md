---
'owox': patch
---

# Fix Edit button clearing sibling credential fields in oneOf config

Secret editing state is now per-field within oneOf configurations, preventing unintended resets of sibling fields and auth type switches.
