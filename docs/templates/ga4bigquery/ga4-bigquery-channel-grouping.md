# GA4 Traffic Sources Data Mart – Custom Channel Grouping by Your Rules (in BigQuery)

This Data Mart defines **traffic source and channel grouping logic for GA4 sessions** using the GA4 BigQuery export — without relying on GA4’s default channel definitions.

If you’ve ever had debates like:

- “Is LinkedIn paid or social?”  
- “Why does Email look different in this dashboard?”  
- “Why don’t these channel numbers match across reports?”  

…the root cause is always the same: **no single, documented source of truth for traffic source logic**.

This Data Mart template fixes that.

---

## What This Data Mart Does

This SQL creates a **reusable, standardized traffic source layer** where:

- **One row = one GA4 session**
- Traffic source data is extracted from the `session_start` event
- `source`, `medium`, and `campaign` are captured cleanly
- A **custom `channelGrouping` field** is generated using explicit business rules
- Channel definitions are transparent, editable, and documented

Instead of relying on GA4’s opaque defaults, you control exactly how traffic is classified.

---

## Channel Groupings Included

This Data Mart assigns each session into a clear channel bucket, such as:

- **AI** (ChatGPT, Perplexity, Claude, etc.)
- **Organic**
- **Paid Media**
- **Email**
- **Social** (LinkedIn, YouTube, Facebook, Other)
- **Direct**
- **Referral**
- **Other**

You can easily modify or extend these rules to match **your company’s internal taxonomy**.

---

## Why This Matters

Without a centralized definition:

- Every dashboard applies slightly different logic
- Marketing, Product, and Leadership see conflicting numbers
- Analysts waste time debugging instead of analyzing

With this Data Mart:

- Traffic source logic is **defined once**
- Channel grouping is **consistent across all reports**
- Every dashboard, spreadsheet, and BI tool tells the same story

---

## Where to Use This

This Data Mart is designed to be reused across:

- Google Sheets  
- Looker Studio  
- Tableau / Power BI  
- Downstream Data Marts (Sessions, Pageviews, Conversions, Funnels)  
- AI and analytics workflows  

It works especially well when **joined with a GA4 Sessions Data Mart** to power full-funnel reporting.

---

## How to Use It with OWOX Data Marts

1. Create a new **SQL Data Mart** in [OWOX Data Marts](https://www.owox.com/app-signup)  
2. Paste the SQL from this file  
3. Document fields with business-friendly aliases and descriptions  
4. Publish once and reuse everywhere  
5. Schedule automated delivery to Sheets or BI tools  

> 💡 **Tip:** Store this logic in OWOX Data Marts to avoid copy-pasting SQL across dashboards and tools.

---

## 🎯 Philosophy

Traffic sources are **not a technical problem** — they’re a business definition problem.

This Data Mart helps you:

- Own your definitions  
- Eliminate ambiguity  
- Align teams around one version of the truth  

---

If you're also defining **GA4 Sessions, Visitors, Pageviews, or Conversions**, this Data Mart fits naturally into a larger, reusable GA4 data model.

Happy analyzing 🚀

## SQL

```sql
WITH raw_data AS (
SELECT
  REGEXP_REPLACE(user_pseudo_id, r'^GA\d\.\d\.', '') || '_' || 
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
  user_pseudo_id,
  PARSE_DATE('%Y%m%d', event_date) AS session_date,
  traffic_source.source AS source,
  traffic_source.medium AS medium,
  traffic_source.name AS campaign
  FROM
    `your_project_id.your_ga4_dataset_id.events_2025*`
  WHERE
    event_name = 'session_start'
    AND user_pseudo_id IS NOT NULL
)

SELECT
*,
  CASE
    WHEN REGEXP_CONTAINS(source, r'(?i)(chatgpt|perplexity|claude|otheraiplatform)') 
      THEN 'AI'

    WHEN REGEXP_CONTAINS(medium, r'(?i)organic')
      OR (REGEXP_CONTAINS(medium, r'(?i)referr?al') AND REGEXP_CONTAINS(source, r'(?i)(google|bing|yoursearchnetwork)'))
      THEN 'Organic'

    WHEN REGEXP_CONTAINS(medium, r'(?i)(cpc|ppc|cpm|paid|display|ads?|remarketing|target)') 
      THEN 'Paid'

    WHEN REGEXP_CONTAINS(medium, r'(?i)email') 
      OR source = 'newsletter'
      THEN 'Email'

    WHEN REGEXP_CONTAINS(source, r'(?i)linkedin') 
      THEN 'Social LinkedIn'

    WHEN REGEXP_CONTAINS(source, r'(?i)youtube') 
      THEN 'Social YouTube'

    WHEN REGEXP_CONTAINS(source, r'(?i)facebook|fb') 
      THEN 'Social Facebook'

    WHEN REGEXP_CONTAINS(medium, r'(?i)(social|smm|post)')
      OR REGEXP_CONTAINS(source, r'(?i)(twitter|x\.com|instagram|insta|tiktok|telegram)')
      THEN 'Social Other'

    WHEN REGEXP_CONTAINS(medium, r'(?i)(none)') 
      OR source = '(direct)'
      THEN 'Direct'

    WHEN REGEXP_CONTAINS(medium, r'(?i)referral')
      THEN 'Referral'

    ELSE 'Other'
  END AS channelGrouping
FROM raw_data
SELECT *
FROM final_pageviews;
