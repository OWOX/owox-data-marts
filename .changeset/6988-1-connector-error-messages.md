---
'owox': minor
---

**Readable connector error messages in Run History**

When a connector's request to its API failed, Run History showed the raw response body, for
example `HTTP 400: Bad Request — {"error":{"message":"Error validating application…","type":…}}`.
It shows the provider's own message again: `HTTP 400: Error validating application. Application
has been deleted.` A skipped account again names what was being imported —
`Importing ad-account: skipped account 123: …` — and so does the run error when every account
was skipped.

<!-- markdownlint-disable-file MD041 MD036 -->
