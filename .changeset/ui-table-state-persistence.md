---
'owox': minor
---

# Implement column visibility and sorting persistence

Previously, user interface configurations such as selected columns in tables and accordion states were reset upon every page refresh. This change ensures that the system now remembers these chosen states at the browser level for:

- Data Marts list
- Storages list
- Data Marts details (Destinations, Triggers, and Reports lists).
