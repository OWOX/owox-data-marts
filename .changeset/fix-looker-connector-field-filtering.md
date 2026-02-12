---
'owox': minor
---

# Fix Looker Studio connector requests with forFilterOnly fields

Remove incorrect `forFilterOnly` exclusion in `getRequestedFieldNames` to ensure all requested fields are returned in the connector data response.
