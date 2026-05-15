---
'owox': minor
---

# Stricter project ownership check when linking an existing OAuth credential to a new destination

Creating a Google Sheets destination with a pre-existing `credentialId` now requires that credential to belong to the same project as the destination being created. Requests that reference a credential from a different project are rejected with `403 Forbidden — Credential does not belong to this project`.
