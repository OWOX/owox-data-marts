---
'owox': minor
---

# Add output controls for Redshift data marts

Add output controls (filters, slices, sort, limit) for AWS Redshift data marts, and
bound the relative-date presets so they no longer match future-dated rows across all
storages: `this_month`/`this_year` are clamped to the current period, and
`last_n_days`/`last_n_months` now stop at today (previously lower-bound only).
