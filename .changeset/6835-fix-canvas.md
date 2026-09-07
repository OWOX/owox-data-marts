---
'owox': minor
---

# Fix the Model Canvas failing with a full-page error on larger data models

**Problem.** Opening the Model Canvas — or the Joinable Data Marts diagram — for a
storage with many Data Marts and relationships could replace the whole page with a
"Something went wrong" error screen right after the loading skeleton. Storages with
only a few Data Marts were unaffected, so the failure was intermittent and hard to
reproduce.

**Cause.** The automatic layout step throws on some otherwise-valid relationship
graphs — typically when a model has several relationships between the same pair of
Data Marts, a Data Mart joined to itself, or circular joins. That error was not
handled, so it propagated to the route error boundary and took down the entire page
instead of just the canvas.

**Fix.** The canvas now recovers instead of crashing. When the layout step fails it
retries with a simplified view of the relationships, which resolves the vast
majority of these cases and still produces a proper layout. If that also fails, it
falls back to a plain grid you can rearrange by dragging. Node positions you set are
still saved per storage.
