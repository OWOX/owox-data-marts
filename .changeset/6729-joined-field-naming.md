---
'owox': minor
---

# Joined field names read better in Google Sheets

Columns coming from a joined Data Mart used to lead with the Data Mart name — `RFM_SEGMENT Recency Score` — which pushed the part you actually look for out of view in every header cell at once. Shortening Data Mart titles was not a real fix: connector-based Data Marts carry their endpoint in the title, and prepared client tables often cannot be renamed at all.

Google Sheets now writes the Data Mart name after the field name, in parentheses: `Recency Score (RFM_SEGMENT)`. For a chain of joins the name is the Data Mart the field actually comes from, not the whole path. Fields from the report's own Data Mart are unchanged, and a blank Output Alias still produces a bare field name.

Existing sheets pick the new headers up on their next refresh. Row 1 is rewritten in place — no column is added, removed or reordered, and nothing shifts under your own content to the right of the imported range.

Data Studio, email-based destinations, the HTTP data endpoint and MCP field metadata keep the Data Mart name as a prefix — the position follows the surface that renders the label, not the report, so reading a Google Sheets report through the HTTP data endpoint still returns the prefixed form. Match columns on the technical field name, which is identical everywhere.

Labels are also no longer padded: an Output Alias or field alias typed with a leading or trailing space used to leak that space into the column name, and a whitespace-only alias produced a column that looked unnamed.

A Google Sheets report that would write two columns under the same header now fails with a clear message naming the header, instead of writing the duplicate. Previously the duplicate went in silently and the refresh after it blanked one column, inserted a spare, and pushed your own content further right. Rename one of the two columns, or the Output Alias of the joined Data Mart one of them comes from.
