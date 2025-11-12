import type { InsightListResponseDto } from '../types';

// Temporary mock data for Insights list until the API is implemented.
// Toggle usage via VITE_MOCK_INSIGHTS=true in your .env.local
export const mockInsightsListDto: InsightListResponseDto = {
  data: [
    {
      id: 'insight-1',
      title: 'Revenue by Channel (Demo)',
      template: `# Revenue Analysis by Channel

## Overview
This report provides a comprehensive breakdown of revenue performance across different marketing channels.

## Data Summary
\`\`\`sql
select channel, sum(revenue) as revenue from demo.sales group by 1
\`\`\`

{{#prompt}}
Analyze the revenue distribution across channels. Identify:
1. Which channel generates the most revenue?
2. Are there any underperforming channels that need attention?
3. What percentage does each channel contribute to total revenue?
4. Provide 2-3 actionable recommendations to optimize channel performance.
{{/prompt}}

## Key Metrics
- Total Revenue: **{{total_revenue}}**
- Number of Channels: **{{channel_count}}**
- Top Performing Channel: **{{top_channel}}**

---
*Report generated on {{current_date}}*`,
      createdById: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    },
    {
      id: 'insight-2',
      title: 'Top Products Last 30 Days (Demo)',
      template: `# Top Products Performance Report

## Executive Summary
Analysis of best-selling products over the last 30 days to identify trends and opportunities.

### Data Query
\`\`\`sql
select product, sum(quantity) as qty 
from demo.sales 
where date >= current_date - interval 30 day 
group by 1 
order by 2 desc 
limit 10
\`\`\`

## Product Performance Analysis

{{#prompt}}
Based on the top 10 products data:
1. What patterns do you see in product sales?
2. Are there any seasonal trends or anomalies?
3. Which products show the most growth potential?
4. Suggest inventory management strategies based on these sales patterns.
5. Identify cross-selling or bundling opportunities.
{{/prompt}}

## Quick Stats
| Metric | Value |
|--------|-------|
| Analysis Period | Last 30 Days |
| Products Analyzed | Top 10 |
| Total Units Sold | **{{total_quantity}}** |

---
**Note:** This report focuses on quantity sold. Consider analyzing revenue impact for complete insights.`,
      createdById: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    },
    {
      id: 'insight-3',
      title: 'New vs Returning Users (Demo)',
      template: `# User Acquisition & Retention Analysis

## Purpose
Understanding the balance between new user acquisition and user retention to optimize growth strategies.

## Dataset
\`\`\`sql
select user_type, count(*) as users from demo.users group by 1
\`\`\`

---

## AI-Powered Insights

{{#prompt}}
Evaluate the new vs. returning users ratio and provide:
1. What is the current retention rate and is it healthy for our business model?
2. How does our new user acquisition compare to industry benchmarks?
3. What does the ratio tell us about product-market fit and user satisfaction?
4. Recommend 3 specific strategies to improve user retention.
5. Should we focus more on acquisition or retention based on these numbers?
{{/prompt}}

---

## Next Steps
1. Monitor weekly trends
2. Implement recommended retention strategies
3. A/B test new acquisition channels
4. Review user onboarding experience

*Last updated: {{timestamp}}*`,
      createdById: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    },
  ],
};
