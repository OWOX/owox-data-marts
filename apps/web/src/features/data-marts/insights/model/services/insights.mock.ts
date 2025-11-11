import type { InsightListResponseDto } from '../types';

// Temporary mock data for Insights list until the API is implemented.
// Toggle usage via VITE_MOCK_INSIGHTS=true in your .env.local
export const mockInsightsListDto: InsightListResponseDto = {
  data: [
    {
      id: 'insight-1',
      title: 'Revenue by Channel (Demo)',
      template: 'select channel, sum(revenue) as revenue from demo.sales group by 1',
      createdById: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    },
    {
      id: 'insight-2',
      title: 'Top Products Last 30 Days (Demo)',
      template: 'select product, sum(quantity) as qty from demo.sales where date >= current_date - interval 30 day group by 1 order by 2 desc limit 10',
      createdById: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    },
    {
      id: 'insight-3',
      title: 'New vs Returning Users (Demo)',
      template: 'select user_type, count(*) as users from demo.users group by 1',
      createdById: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      modifiedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    },
  ],
};
