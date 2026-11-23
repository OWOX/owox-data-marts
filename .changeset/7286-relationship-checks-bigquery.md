---
'owox': minor
---

**Find unmatched rows in related Google BigQuery Data Marts**

**You can now see unmatched join values when a relationship check uses a complex view or SQL query.** Previously, BigQuery could reject the check with `Correlated subqueries ... not supported`. The check then showed **Execution error**.

**Relationship integrity** checks source join values against the target Data Mart. **Reverse relationship** checks target join values against the source Data Mart. If a check finds unmatched rows, it shows **Failed** and lists examples of their join values.

See [Data Quality Checks](../../docs/getting-started/setup-guide/data-quality-checks.md).

<!-- markdownlint-disable-file MD041 MD036 -->
