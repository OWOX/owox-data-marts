# GA4 Sessions Data Mart - One Row Per Session

This SQL defines **Sessions in GA4 in a clean and reusable way**, using the GA4 BigQuery export data.

Let's collect GA4 events into Sessions.
If you build reports without defining your session logic centrally, every dashboard ends up telling a different story.

This script standardizes event sessionization logic into a **single, reusable Data Mart**:

- One row = one session
- Includes session identifiers
- Visitor identifiers
- Session landing page
- Date & timestamp
- Captures traffic source information
- Geo, location, device, consent - everything you might ever need to analyze

Use this as the foundation for reporting in:

- Google Sheets  
- Looker Studio  
- Tableau / Power BI  
- AI assistants and analytics workflows  

> **Tip:** Create a Data Mart in [OWOX Data Marts](https://www.owox.com/app-signup), paste this SQL, and reuse it across destinations — no more copying queries between dashboards.

---

## SQL

WITH 
  raw_data AS --extracting raw data from GA4 Export and extracting dimensions that we will need in future from event_params
    (
      SELECT
        *,
        REGEXP_REPLACE(user_pseudo_id, r'^GA\d\.\d\.', '') || '_' || (SELECT value.int_value FROM UNNEST(event_params) WHERE KEY = 'ga_session_id') sessionId,
        (SELECT MAX(IF(ep.key='page_location', ep.value.string_value, null)) FROM UNNEST(event_params) AS ep) AS pageLocation,
       FROM `your_project_id.your_ga4_dataset_id.events_2025*`
    ),
  final_data AS --making of final data structure
    (
      SELECT
        sessionId AS id,
        user_pseudo_id,
        PARSE_DATE('%Y%m%d',event_date) AS session_date,
        TIMESTAMP_MICROS(event_timestamp) AS startedAt,
        IF(STRPOS(pageLocation,'?')>0,SUBSTR(pageLocation,1,STRPOS(pageLocation,'?')-1),pageLocation) AS landingPage,
        STRUCT(
          device.category AS category,
          device.mobile_brand_name AS modelBrandName,
          device.mobile_model_name AS mobileModelName,
          device.mobile_marketing_name AS mobileMarketingName,
          device.operating_system AS operatingSystem,
          device.web_info.browser AS browser
        ) AS device,
        STRUCT(
          geo.continent AS continent,
          geo.sub_continent AS subContinent,
          geo.country AS country,
          geo.region AS region,
          geo.city AS city
        ) AS geoNetwork,
        STRUCT(
          privacy_info.analytics_storage AS analytics,
          privacy_info.ads_storage AS ads
        ) AS consent,
        STRUCT(
          collected_traffic_source.manual_source,
          collected_traffic_source.manual_medium,
          collected_traffic_source.manual_campaign_name,
          collected_traffic_source.manual_term,
          collected_traffic_source.manual_content
        ) AS trafficSource,        
      FROM
        raw_data
      WHERE 
        event_name LIKE 'session_start'
        AND
        user_pseudo_id IS NOT null
      QUALIFY
        ROW_NUMBER() OVER (PARTITION BY sessionId ORDER BY startedAt ASC)=1
    )
SELECT
  *
FROM
  final_data
