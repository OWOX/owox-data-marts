---
'owox': minor
---

# Add output controls for Redshift data marts

Add output controls (filters, slices, sort, limit) for AWS Redshift data marts, and
tighten the relative-date presets across all storages: `last_n_days`/`last_n_months`
now stop at today (previously lower-bound only, so future-dated rows leaked in), and
`this_month`/`this_year` are clamped to the current period (a future date still inside
the current month/year continues to match).
