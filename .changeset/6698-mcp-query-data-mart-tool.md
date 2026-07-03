---
"owox": minor
---

# Add a query_data_mart MCP tool and expose blended fields in data mart details

AI assistants connected to OWOX over MCP can now query a data mart directly with the new `query_data_mart` tool: pick fields, filter (pre-join slices and post-join filters), aggregate (SUM, COUNT, COUNT_DISTINCT, AVG, MIN, MAX, percentiles), bucket dates by day/week/month/quarter/year, and get server-side totals over all matching rows. Results come back as a compact, header-once table. Each call runs against your warehouse and is recorded in Run History (query definition and executed SQL only — never row values). Every call costs credits.

`get_data_mart_details_by_id` now also returns `joined_fields` — the fields contributed by blended/joined data marts, with their qualified names, source data mart, and allowed aggregations — so the assistant can discover, query, and slice on blended fields. Only fields from joined data marts you can report on are returned.
