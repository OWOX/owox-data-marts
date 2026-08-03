---
'owox': minor
---

# Joined field names read better in Google Sheets

Columns coming from a joined Data Mart used to lead with the Data Mart name — `RFM_SEGMENT Recency Score` — which pushed the part you actually look for out of view in every header cell at once. Shortening Data Mart titles was not a real fix: connector-based Data Marts carry their endpoint in the title, and prepared client tables often cannot be renamed at all.

Google Sheets now writes the Data Mart name after the field name, in parentheses: `Recency Score (RFM_SEGMENT)`. For a chain of joins the name is the Data Mart the field actually comes from, not the whole path. Fields from the report's own Data Mart are unchanged, and a blank Output Alias still produces a bare field name.

Existing sheets pick the new headers up on their next refresh. Row 1 is rewritten in place — no column is added, removed or reordered, and nothing shifts under your own content to the right of the imported range.

Data Studio, email-based destinations, the HTTP data endpoint and MCP field metadata keep the Data Mart name as a prefix.
