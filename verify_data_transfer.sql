-- SQL queries to verify data transfer

-- 1. Check if the table exists and count records
SELECT 
    COUNT(*) as total_records,
    MIN(created_at) as first_record,
    MAX(created_at) as last_record
FROM public.analytics_data;

-- 2. Sample of the transferred data
SELECT 
    campaign_name,
    date,
    impressions,
    clicks,
    cost,
    conversions,
    ctr
FROM public.analytics_data 
ORDER BY date DESC 
LIMIT 10;

-- 3. Summary by campaign
SELECT 
    campaign_name,
    COUNT(*) as record_count,
    SUM(impressions) as total_impressions,
    SUM(clicks) as total_clicks,
    SUM(cost) as total_cost,
    SUM(conversions) as total_conversions
FROM public.analytics_data 
GROUP BY campaign_name 
ORDER BY total_impressions DESC;
