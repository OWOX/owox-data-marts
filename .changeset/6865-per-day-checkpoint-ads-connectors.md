---
'owox': minor
---

# Resumable incremental imports for Google Ads, Reddit Ads, Criteo and X Ads

Previously, an interrupted incremental run restarted the whole date range from the beginning, so long imports could retry endlessly without ever finishing. These connectors now save their progress as the import advances. An interrupted run resumes from the last completed date instead of starting over.
