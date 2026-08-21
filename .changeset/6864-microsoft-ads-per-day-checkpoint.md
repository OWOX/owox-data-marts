---
'owox': minor
---

# Resumable incremental imports for Microsoft Ads

Previously, an interrupted incremental run restarted the whole date range from the beginning, so long imports could retry endlessly without ever finishing. The connector now saves its progress after each imported day. An interrupted run resumes from the last completed day instead of starting over.
