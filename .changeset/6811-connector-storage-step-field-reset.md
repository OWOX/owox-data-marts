---
'owox': minor
---

# Editing the table name no longer clears the other storage fields

On the connector setup step "Choose where to store your data", clearing the table name also wiped the dataset (or database) name. Typing a dataset name was impossible while the table field stayed empty — each keystroke disappeared.

The step now stops re-reading its own emitted value once you edit any field. Defaults still fill in on first open, and an existing target still loads when you edit a saved connector. The fix applies to every storage type: Google BigQuery, AWS Athena, Snowflake, AWS Redshift, and Databricks.
