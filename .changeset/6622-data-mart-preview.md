---
'owox': minor
---

**Preview Data Mart rows from Data Setup**

The **Data Setup** tab now has a **Preview data** button under the Output Schema. It runs a query in your data warehouse and shows the first 10 rows of every visible field, so you can check the Input Source and schema before building reports. Draft Data Marts can be previewed too.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/18b9af1a3ba158edd7c664e5dd330b93/iframe>

- Change **Limit** (1–1000) and click **Update** to fetch more rows; page through them without another query.
- Click a column name to sort by it (ascending, descending, off); the sort runs in the warehouse, so you see the real top rows.
- Filter a column from its header: the condition runs in the warehouse as a `WHERE` clause, and active filters show as chips above the table.
- Each preview, including **Re-run** and each limit, sort or filter change, is a new warehouse query. It is not a Data Mart run: it does not appear in Run History and does not consume credits.

See [Data Preview](../../docs/getting-started/setup-guide/data-preview.md).
