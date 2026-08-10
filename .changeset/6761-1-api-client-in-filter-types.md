---
'owox': minor
---

# api-client: expose `in`/`not_in` filters and the new relative-date presets in the traversal types

Release 0.31.0 taught the Data Mart traversal API the `in`/`not_in` operators and the `this_week`/`last_week`/`this_quarter`/`last_quarter`/`next_n_days` relative-date presets, but the public `@owox/api-client` types were not updated: a TypeScript caller writing `operator: 'in'` got a compile error even though the request itself works.

- `TraverseDataFilterRule` gains the `in`/`not_in` branch: `value` is an **array** of 1..500 same-type values (all strings or all numbers) — never a comma-separated string, and never booleans (use `is_true`/`is_false`).
- `TraverseDataRelativeDatePreset` gains `this_week`, `last_week`, `this_quarter`, `last_quarter`, and `next_n_days`.
- The `@owox/api-client` guide now documents every filter operator's `value` shape (scalar / array / `{ from, to }` / preset), the `in`/`not_in` constraints, the full relative-date preset list, and the NULL-inclusive semantics of negative operators; the OpenAPI description of the `filter` query parameter shows an `in` example.
