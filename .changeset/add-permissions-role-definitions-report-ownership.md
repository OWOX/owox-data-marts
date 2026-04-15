---
'owox': minor
---

# Extend role definitions and activate report ownership

Reinterpreted existing project roles without changing stored identifiers: Viewer becomes Business User with self-service reporting capabilities, Editor becomes Technical User with full technical maintenance access. Activated Report ownership — Business Users can now create, edit, delete, and run their own Reports and manage Report Triggers, while Technical Users retain project-wide Report management. Business Users can also create, edit, and delete Destinations. Implemented ineffective owner logic: if a Report owner loses access to the DataMart or Destination, they become read-only until access is restored.
