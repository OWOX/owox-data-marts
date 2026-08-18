---
'owox': minor
---

# Memory-safe Keywords import for Microsoft Ads

Previously, importing Keywords from a large Microsoft Ads account crashed the run with an out-of-memory error. The connector now streams records to storage in small chunks instead of loading the whole download at once. Imports of any account size now complete within normal memory limits.
