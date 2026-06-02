---
'owox': minor
---

# Add the HTTP Data API — stream a published Data Mart's rows over HTTP as NDJSON

A new `GET /api/external/http-data/data-marts/{id}.ndjson` endpoint streams the columns
of a published Data Mart as newline-delimited JSON for project members authenticated with
their ODM member token (`x-owox-authorization`). Column-set selectors use `columns=*`
for Data Mart output columns and `columns=**` for all report-available columns, including
joined fields. Repeated `column` parameters select exact column names, so `column=*` and
`column=**` mean literal columns named `*` and `**`. Only reporting-visible columns are
selectable — fields hidden from reporting and columns from excluded blend sources are
rejected. Callers may also pass optional base64url-encoded `filter`/`sort` and a `limit`.
Every pull is recorded as an `HTTP_DATA` Data Mart run (visible in run history) and counted
for consumption; no persisted Report or Data Destination is created.
