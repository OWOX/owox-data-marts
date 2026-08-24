---
'owox': minor
---

# Set the relationship description per join

An inherited join can now override the relationship-level description for its own join path, since the same relationship can carry a different business meaning depending on how it is reached. The Description tab of inherited joins becomes editable — the relationship's text shows as the inherited default, typing overrides it for that join only, and clearing resets back to inherited. MCP tools and the report column picker's join-path tooltip surface the effective description.
