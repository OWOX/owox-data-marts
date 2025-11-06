# GA4 Pageviews Data Mart - One Row Per Pageview

This SQL defines **pageviews in GA4 in a clean and reusable way**, using the GA4 BigQuery export data.

In GA4, pageviews are stored as `page_view` events — which means there is **no pageviews table by default**.  
If you build reports without defining your pageview logic centrally, every dashboard ends up telling a different story.

This script standardizes pageview logic into a **single, reusable Data Mart**:

- One row = one pageview
- Includes visitor & session identifiers
- Extracts `page_location`, `page_title`, and `page_referrer`
- Derives `page_host` and `page_path`
- Captures engagement time (ms)
- Ranks pageviews in each session
- Flags whether the pageview is the **landing page** of the session

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
  SELECT
    user_pseudo_id AS visitorid,
    PARSE_DATE('%Y%m%d', event_date) AS eventdate,
    TIMESTAMP_MICROS(event_timestamp) AS eventtimestamp,
    REGEXP_REPLACE(user_pseudo_id, r'^GA\d\.\d\.', '') || '_' || (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS sessionid,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS pagelocation,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS pagetitle,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS pagereferrer,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagementtime
  FROM
    `your_project_id.your_ga4_dataset_id.events_2025*`
  WHERE
    event_name = 'page_view'
    AND user_pseudo_id IS NOT NULL
),

extracted_data AS (
  SELECT
    *,
    REGEXP_EXTRACT(pagelocation, r'^https?://([^/]+)') AS pagehost,
    REGEXP_EXTRACT(pagelocation, r'^https?://[^/]+(/.*)$') AS pagepath
  FROM raw_data
),

ranked_data AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY sessionid ORDER BY eventtimestamp) AS pageview_rank_in_session
  FROM extracted_data
),

final_pageviews AS (
  SELECT
    CONCAT(sessionid, '_', pageview_rank_in_session) AS pageviewid,
    eventdate,
    eventtimestamp,
    visitorid,
    sessionid,
    pagehost,
    pagepath,
    pagetitle,
    pagereferrer,
    engagementtime,
    pageview_rank_in_session,
    IF(pageview_rank_in_session = 1, TRUE, FALSE) AS is_session_landing_page
  FROM ranked_data
)

SELECT *
FROM final_pageviews;
