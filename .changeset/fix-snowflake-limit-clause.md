---
'owox': minor
---

# Fix Snowflake data mart schema derivation to properly handle queries with LIMIT clauses by wrapping them in subqueries instead of naive concatenation

Enhanced Snowflake data mart schema derivation to properly handle queries with LIMIT clauses by wrapping them in subqueries instead of naive concatenation. This ensures that the schema is derived correctly even when the query contains a LIMIT clause.
