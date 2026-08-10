---
'owox': minor
---

# AI helper failures are now visible and understandable instead of silently disappearing

During AI metadata generation for SQL-based data marts, a missing BigQuery permission (`bigquery.datasets.create`, required by the technical-view flow) failed the run before the AI step — and the error toast auto-dismissed in seconds, so users never learned why nothing was generated. This release improves the communication around such failures without changing the technical-view creation logic itself:

- Generation errors now show as persistent, dismissible notifications instead of an auto-dismissing toast; leaving the page mid-generation leaves a notice that the run was cancelled.
- BigQuery permission errors are rewritten into a human-readable message naming the project and the missing permission, with the raw error expandable for support.
- AI helper trigger logs now include `dataMartId` and `projectId`, and the AI insights facade logs the caught error for failed metadata generation, so production incidents can be found by filtering logs on the data mart id.
