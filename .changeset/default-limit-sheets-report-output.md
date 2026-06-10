---
"owox": minor
---

# Add default limit to sheets report output config

Google Sheets reports now apply a default row limit of 10,000 rows instead of returning all rows. This helps prevent hitting Google Sheets cell limits when Data Marts return large datasets. A notification tooltip is shown when creating a new report before the first run, and the output controls icon reflects the applied limit.
