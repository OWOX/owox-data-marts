---
'owox': patch
---

# Fix release build broken by duplicate google-auth-library

A transitive dependency drift left two copies of `google-auth-library` (v10) in the
tree — one hoisted at the root and a second pinned exactly by `googleapis-common` —
which produced incompatible `OAuth2Client` types and broke the TypeScript build of the
Google Sheets and BigQuery integrations. A scoped npm override now makes
`googleapis-common` reuse the root copy, so the packages build and publish reliably again.
