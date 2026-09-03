---
'owox': minor
---

# Fix LinkedIn Ads adAnalytics silently dropping data when response exceeds 15,000 elements

Previously, an adAnalytics export over a large date range could silently lose data: the endpoint does not support pagination and caps its response at 15,000 elements, so campaigns from the beginning of the period were missing from the result. The connector now fetches, saves, and checkpoints analytics one day at a time, so a single day cannot exceed the limit, and an interrupted run resumes from the last completed day instead of restarting the whole range.

If a daily response still reaches 15,000 elements, the import finishes with a Warning status that lists the affected days instead of losing data silently.

The connector also refreshes the LinkedIn access token once per run instead of before every request. LinkedIn API errors now fail the run instead of silently returning no rows; rate-limit (429) and server (5xx) errors are retried first.

Analytics days are now computed in UTC, so the day the connector requests always matches the day it logs and checkpoints, regardless of the runner's time zone.
