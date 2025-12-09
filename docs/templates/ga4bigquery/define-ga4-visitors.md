# GA4 Visitors Data Mart - One Row Per Visitor

This SQL defines **Visitors in GA4 BigQuery Export Data in a clean and reusable way**.

Let's collect GA4 events into Visitors.
If you build reports without defining your visitors logic centrally, every dashboard ends up telling a different story.

This script standardizes visitor definition logic into a **single, reusable Data Mart**:

- One row = one visitor
- Includes visito identifiers
- Visitor identifiers
- First date seen
- Last date seen
- Count of total events
- Geo, location, device, consent - are not included, as they are the part of the [sessions data mart](./ga4bigquery/define-GA4-sessions.md)

Use this as the foundation for reporting in:

- Google Sheets  
- Looker Studio  
- Tableau / Power BI  
- AI assistants and analytics workflows  

> **Tip:** Create a Data Mart in [OWOX Data Marts](https://www.owox.com/app-signup), paste this SQL, and reuse it across destinations — no more copying queries between dashboards.

---

## SQL

```sql
WITH raw_data AS (
  -- Pull data from the GA4 events table
  SELECT
    user_pseudo_id,
    PARSE_DATE('%Y%m%d', event_date) AS visit_date
       FROM `your_project_id.your_ga4_dataset_id.events_2025*`
  WHERE
    user_pseudo_id IS NOT NULL
),
aggregated_visitors AS (
  -- Aggregate visitor-level metrics
  SELECT
     user_pseudo_id,
    MIN(visit_date) AS first_seen_date,  -- First date seen
    MAX(visit_date) AS last_seen_date,   -- Last date seen
    COUNT(*) AS number_of_events          -- Count of events
  FROM
    raw_data
  GROUP BY
     user_pseudo_id
)
SELECT *
FROM aggregated_visitors
ORDER BY  user_pseudo_id
