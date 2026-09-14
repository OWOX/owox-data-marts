---
'owox': minor
---

# Search finds reports

Search in OWOX Data Marts now covers reports alongside Data Marts, storages, and destinations. Type part of a report name — a misspelling is fine — and the report appears with its Data Mart and destination; opening it goes straight to the report in the Data Mart's Reports tab. The report name ranks highest, the Data Mart and destination names count as weaker matches, so "revenue" also finds the reports built on a Data Mart named "Revenue". A report is found when its Data Mart is visible to you; renaming a Data Mart or a destination updates the reports that reference it, and existing reports are indexed without any action on your side.

`/api/search` accepts `entityTypes=REPORT`; a report result carries its `report.dataMart`, `report.dataDestination` (with `type`), and `url`, the direct link to the report. The API client returns the same typed fields from `client.search.query(prompt, { entityTypes: ['REPORT'] })`. Searches for the other entity types return the same results as before.

The MCP server adds `get_relevant_reports_by_prompt`: given a natural-language prompt it returns the matching reports with their Data Mart, destination, relevance score, and direct link, so the assistant can open, rerun, change, or schedule a report the user names without listing every report of every Data Mart first. `get_data_mart_reports` keeps working as before.
