---
'owox': minor
---

# Add the HTTP Data API — stream a published Data Mart's rows over HTTP as NDJSON

A new `GET /api/external/http-data/data-marts/{id}.ndjson` endpoint streams the selected
columns of a published Data Mart as newline-delimited JSON for project members
authenticated with their ODM member token (`x-owox-authorization`). Callers explicitly
choose columns and may pass optional base64-encoded `filter`/`sort` and a `limit`. Every
pull is recorded as an `HTTP_DATA` Data Mart run (visible in run history) and counted for
consumption; no persisted Report or Data Destination is created.
