---
'owox': minor
---

# Split LinkedIn dateRange fields and hardcode field limits

- Replace single dateRange field with separate dateRangeStart and dateRangeEnd fields for better data granularity
- Remove MaxFieldsPerRequest param and hardcode the value
