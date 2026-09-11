---
'owox': minor
---

# Keep output schema field connection statuses server-controlled

Output schema updates no longer accept a client-provided connection status as the field's actual state. API users and plugin developers could previously encounter misleading connected fields when saving a schema before the storage had verified them; the backend now derives the status, and the web app omits it from update requests.
