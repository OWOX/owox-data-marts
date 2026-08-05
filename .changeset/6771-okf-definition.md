---
'owox': minor
---

# OKF export now carries each Data Mart's definition

Every document in the OKF bundle exported from the Models canvas gains a **Definition** section: the fully qualified table or view name, the table pattern, or the SQL query behind the Data Mart. Connector configurations are deliberately excluded — their source settings can carry sensitive parameters, unlike a plain table path or query text.

This closes the gap that made AI assistants ask for your dataset: with the physical references in the bundle, an assistant can now write runnable SQL — real project, dataset, and table names instead of `<YOUR_DATASET>` placeholders. The JSON export intentionally stays definition-free, matching the sanitized share format of OWOX Model Canvas.
