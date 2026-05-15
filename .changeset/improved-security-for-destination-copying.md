---
'owox': minor
---

# Stricter project ownership and copy-permission checks when linking an existing OAuth credential to a new destination

Creating a Google Sheets destination with a pre-existing `credentialId` is now protected by the same two checks that already guarded credential copying from a source destination.

- **Project ownership.** The credential must belong to the same project as the destination being created. Requests that reference a credential from a different project are rejected with `403 Forbidden — Credential does not belong to this project`. This brings the create endpoint in line with the destination update endpoint, which has always performed this check.
- **Copy permission.** If the supplied credential is already linked to another destination in your project, creating a new destination with that same credential now requires explicit copy-credentials access on the existing destination — the same permission the **Copy from destination** flow has always required. If you do not have access, the request is rejected with `403 Forbidden — You do not have permission to copy credentials from this destination`.

Legitimate flows are unaffected. When you finish the Google OAuth flow and the UI immediately creates a destination with the returned `credentialId`, the credential is fresh (not yet linked to any destination) and lives in your project, so both checks pass transparently. No database migration or configuration change is required, and existing destinations and credentials are not modified.
