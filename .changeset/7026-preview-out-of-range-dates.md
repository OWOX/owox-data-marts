---
'owox': minor
---

**Preview data no longer fails on out-of-range dates**

On a Databricks or Snowflake Data Mart, **Preview data** failed with a server error when a DATE or
TIMESTAMP column held a value outside the range the app can display (before year −271821 or after
275760), and one such cell broke the whole preview. The preview now loads and shows that cell as
`[Invalid Date]`, with the other rows and columns as usual.

<!-- markdownlint-disable-file MD041 MD036 -->
