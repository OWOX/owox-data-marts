---
'owox': minor
---

# Temporary BigQuery faults no longer fail the whole import

Previously, a single batch rejected by BigQuery with a temporary fault ended the entire run, even after hundreds of thousands of rows had been stored. The storage now waits and saves that batch again, using the existing Max Fetch Retries and Initial Retry Delay settings. Errors that another attempt cannot fix, such as an invalid query or a denied permission, are still reported immediately.
