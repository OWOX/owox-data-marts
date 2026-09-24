# Data Preview

Data Preview shows a sample of real rows from a Data Mart while you set it up, so you can check the Input Source and the Output Schema before building reports on top of them.

## Run a preview

1. Open the Data Mart and select the **Data Setup** tab.
2. Scroll to the **Output Schema** section and click **Preview data**.

The preview runs a query in your data warehouse and shows the first 10 rows of every visible Output Schema field. Each column header shows the field name and its storage type. Use the pagination controls below the table to page through the rows you fetched.

Data Preview works for Draft and Published Data Marts. The Data Mart needs a saved Input Source and a saved Output Schema. If the schema has unsaved changes, you are asked to save or discard them first, because the preview reads the saved schema.

## Change the number of rows

Enter a new value in **Limit** (from 1 to 1000) and click **Update**. The preview runs again and fetches that many rows from the warehouse. When more rows match than the limit, the panel says so.

## Filter the rows

Hover a column header and click the filter icon. Choose a condition, such as **contains**, enter a value, and click **Apply**. The filter is applied in the warehouse as a `WHERE` condition, so the preview returns only matching rows.

Active filters appear as chips above the table. Remove one with its **×**, or clear all of them with the filter counter next to the title. The conditions available for each field type are the same as in [report filters](output-controls.md).

Hidden fields, calculated fields, and fields from joined Data Marts are not part of the preview.

## Warehouse queries and credits

Every preview — the first run, **Re-run**, a new limit, or a filter change — executes a new query in your data warehouse, which your warehouse may bill as usual. Paging through rows you already fetched does not run a new query.

A preview is not a Data Mart run: it does not appear in **Run History** and does not consume OWOX Data Marts credits.
