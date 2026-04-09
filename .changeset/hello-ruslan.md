---
'owox': minor
---

# Add error boundaries to gracefully handle unexpected application crashes

Replace the default React "Unexpected Application Error" screen with user-friendly fallback UI. When a page crashes, users now see a styled error page with options to navigate home or reload — instead of raw technical stack traces. The sidebar stays visible for in-layout errors, so users can navigate away without a full page reload.
