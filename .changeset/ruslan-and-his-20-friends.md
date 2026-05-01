---
'owox': minor
---

# Import many data marts at once from BigQuery

You can now create up to 20 data marts at a time directly from the Data Marts page,
without going through the create wizard for each one.

- A new **Import…** button on the Data Marts page opens a picker that lists every
  table and view in your selected Google BigQuery storage.
- Tick the resources you want, review them in the chips strip below, and click
  **Create** — each pick becomes its own data mart, named after the resource.
- Sharded tables (for example `events_20240101`, `events_20240102`, …) are
  recognized automatically and shown as a single entry like `events_*`. Picking
  one creates a Table Pattern data mart that covers all shards at once.
- The same wildcard recognition now powers the **Fill from Storage** button on
  the Table Pattern field — you no longer have to scroll through individual
  shard entries to find the pattern you want.
- If the chosen storage has broken credentials or missing permissions, the
  dialog now tells you what's wrong and offers a one-click shortcut to finish
  the storage setup, instead of failing silently.
