---
'owox': patch
---

# Fix nested blended field name collisions in joinable data marts

Nested (struct) fields in joined sources no longer share report column names with flat siblings after dots are replaced with underscores. For example, flat `campaign_id` and nested `campaign.id` under the same join alias now produce distinct unified names (`ads__campaign_id` vs `ads__campaign_id__a8702665`).

- **Flat blended names** stay byte-for-byte unchanged; existing reports that only use flat joined columns need no config changes.
- **Nested blended names** always include a stable 8-character hash of `(aliasPath, originalFieldName)`. New saves and reloads use the hashed form end-to-end.
- **Legacy nested names** in already-saved `columnConfig` / filter / sort (pre-hash form such as `customers__campaign_id` for `campaign.id`) are intentionally not migrated in this release and will not resolve after deploy. That population was empty when this shipped; a follow-up migration can re-key them if needed. The pre-join filter migration (`MigratePreJoinFilterToUnifiedColumn`) still emits the pre-hash form for historical rules only.
- **Rolling deploy:** during a mixed old/new backend fleet, nested-field reports saved or run mid-rollout can briefly orphan until every pod serves the hashed names. Self-heals once the fleet is fully on the new version; prefer rolling through before bulk-editing nested-column reports.
