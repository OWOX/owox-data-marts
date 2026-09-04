---
'owox': minor
---

# Temporary BigQuery faults no longer fail the whole import

Previously, a single batch that BigQuery failed with a temporary fault ended the entire run, even after hundreds of thousands of rows had been stored. The storage now waits and saves that batch again, using the existing Max Fetch Retries and Initial Retry Delay settings. This covers both a batch BigQuery rejects outright and one it accepts and then fails while running. Errors that another attempt cannot fix, such as an invalid query or a denied permission, still stop the run immediately.
