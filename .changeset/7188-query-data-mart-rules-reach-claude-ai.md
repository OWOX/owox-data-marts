---
'owox': minor
---

**claude.ai now gets every rule for querying a Data Mart**

When an analyst asks about their data in claude.ai, the AI assistant builds the query with the `query_data_mart` MCP tool and follows the rules in the tool description. claude.ai keeps only about the first 4,096 characters of a tool description, and this description had about 9,000. So the assistant did not get the rules for choosing between slices and filters or for reading the results, and it could filter a joined Data Mart after the join and report wrong totals without an error. Now the description is shorter than 4,096 characters, and the rules for reading the results come first. Claude Code has the same limit when it loads tools without tool search.

- The table of operators and aggregations for each field type is no longer in the description. `get_data_mart_details_by_id` already returns the operators and aggregation functions that each field accepts, in `operators_by_category` and `allowedAggregations`.
- The description and the [`query_data_mart` reference](../../docs/getting-started/setup-guide/mcp.md#query_data_mart-requires-mcpread-and-mcpwrite) now say when rows are grouped, and that a filter on a joined field sees one value per join key, not the joined rows.

<!-- markdownlint-disable-file MD036 MD041 -->
