---
'owox': minor
---

**Preview Data Mart rows from Data Setup**

The **Data Setup** tab now has a **Preview data** button under the Output Schema. It runs a query in your data warehouse and shows the first 10 rows of every visible field, so you can check the Input Source and schema before building reports. Draft Data Marts can be previewed too.

- Change **Limit** (1–1000) and click **Update** to fetch more rows; page through them without another query.
- Filter a column from its header: the condition runs in the warehouse as a `WHERE` clause, and active filters show as chips above the table.
- Every preview, including **Re-run** and each limit or filter change, appears in **Run History** as a data preview run with its executed SQL, and counts as one Report Run.

See [Data Preview](../../docs/getting-started/setup-guide/data-preview.md).
