---
'owox': minor
---

# Unified column identifiers for output control filters

Slice (pre-join) filters now reference a column by the same fully qualified identifier as
regular output filters — for example `category_details__item_event_count` — instead of a raw
column name plus a separate `aliasPath`. This makes every filter, slice, and sort refer to a
column the same way across the API and the Web/Extension report editor. Existing saved reports
are migrated automatically, so no manual changes are needed.
