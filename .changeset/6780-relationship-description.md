---
'owox': minor
---

# Optional description for Data Mart relationships

Each join between Data Marts can now carry an optional free-text description explaining the business meaning of the relationship (e.g. "Visitors from the website sign up for the product and convert into users").

- **Data Setup UI**: a joined Data Mart's card gets a new **Description** tab next to Join Settings, with an autosaving text area. Inherited (transitive) joins show where to edit the description instead.
- **API**: `POST`/`PATCH /data-marts/:id/relationships` accept an optional `description`, and relationship responses return it. Sending `null` or an empty string clears it.
- **MCP**: `get_data_mart_details_by_id` with `detail_level=with_joined_fields` now returns a `joins` array — one entry per join edge with the joined data marts, the join key fields, and the relationship description — so AI assistants understand not only which fields a join contributes but how and why the data marts relate.
