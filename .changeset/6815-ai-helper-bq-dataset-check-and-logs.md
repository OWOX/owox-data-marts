---
'owox': minor
---

# AI helper on BigQuery: stop requiring `bigquery.datasets.create` when the internal dataset already exists

The AI helper (and every SQL-view refresh) on BigQuery unconditionally ran `CREATE SCHEMA IF NOT EXISTS` before creating the technical view — a DDL that needs project-level `bigquery.datasets.create` even when the dataset already exists, so OAuth users with data-only permissions failed the whole flow. The executor now checks dataset existence via `datasets.get` and issues `CREATE SCHEMA` only when the dataset is missing, falling back to the CREATE attempt when the check itself fails so the permission error stays actionable. AI helper trigger logs now include `dataMartId` and `projectId`, and the AI insights facade logs the caught error for failed metadata generation — both so production incidents can be found by filtering logs on the data mart id.

AI helper failures are also no longer easy to miss in the UI: generation errors now show as persistent, dismissible notifications instead of an auto-dismissing toast, BigQuery permission errors are rewritten into a human-readable message naming the project and the missing permission (with the raw error expandable), and leaving the page mid-generation now leaves a notice that the run was cancelled.
