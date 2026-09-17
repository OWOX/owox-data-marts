---
'owox': minor
---

# AI assistants now use the metrics your Data Mart already defines

An assistant connected through the MCP server now selects a Calculated Field whose formula aggregates — a ROAS written as `SUM(revenue) / NULLIF(SUM(adCost), 0)`, a CTR, a conversion rate — instead of pulling the columns behind it and doing the division in its reply.

That matters for two reasons. OWOX computes the field in your warehouse over every row matching the question, so the answer stays correct even when the row limit truncates what the assistant sees; arithmetic performed on truncated rows looked like a normal number and gave no sign it was incomplete. And the definition stays the one you wrote — any weighting, exclusion or `NULLIF` guard inside the formula is applied, rather than quietly lost in a plain division.

`get_data_mart_details_by_id` now marks such a field with a `usage` note, and states that an empty `allowedAggregations` on it means the value is already computed rather than unavailable.

Nothing in your Data Marts changes, and no field needs to be redefined.
