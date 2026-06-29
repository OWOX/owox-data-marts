---
"owox": minor
---

# Optimize search indexing pagination to avoid MySQL sort-buffer exhaustion

Reduce the row width involved in search-index pagination queries so MySQL does not need to filesort large JSON/text payloads while indexing data marts, storages, and destinations. Storage and destination indexing now page narrow key rows before hydrating credential data, while data-mart indexing uses a narrower projection and an order that aligns with the existing `idx_dm_project_deleted_created` composite index.
