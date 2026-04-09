import type { RouteObject } from 'react-router-dom';
import DataMartOverviewContent from '../../pages/data-marts/edit/DataMartOverviewContent.tsx';
import DataMartDataSetupContent from '../../pages/data-marts/edit/DataMartDataSetupContent.tsx';
import DataMartDestinationsContent from '../../pages/data-marts/edit/DataMartDestinationsContent.tsx';
import DataMartRunHistoryContent from '../../pages/data-marts/edit/DataMartRunHistoryContent.tsx';
import DataMartInsightsContent from '../../pages/data-marts/edit/DataMartInsightsContent.tsx';
import DataMartNextInsightsContent from '../../pages/data-marts/edit/DataMartNextInsightsContent.tsx';
import DataMartTriggersContent from '../../pages/data-marts/edit/DataMartTriggersContent.tsx';
import PrevInsightsListView from '../../features/data-marts/insights-prev/components/InsightsListView.tsx';
import PrevInsightDetailsView from '../../features/data-marts/insights-prev/components/InsightDetailsView.tsx';
import InsightsListView from '../../features/data-marts/insights/components/InsightsListView.tsx';
import InsightDetailsView from '../../features/data-marts/insights/components/InsightDetailsView.tsx';
import { LayoutErrorBoundary } from '../../components/errors';

export const dataMartDetailsRoutes: RouteObject[] = [
  {
    path: 'overview',
    element: <DataMartOverviewContent />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'data-setup',
    element: <DataMartDataSetupContent />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'insights',
    element: <DataMartInsightsContent />,
    errorElement: <LayoutErrorBoundary />,
    children: [
      { index: true, element: <PrevInsightsListView /> },
      { path: ':insightId', element: <PrevInsightDetailsView /> },
    ],
  },
  {
    path: 'insights-v2',
    element: <DataMartNextInsightsContent />,
    errorElement: <LayoutErrorBoundary />,
    children: [
      { index: true, element: <InsightsListView /> },
      { path: ':insightId', element: <InsightDetailsView /> },
    ],
  },
  {
    path: 'reports',
    element: <DataMartDestinationsContent />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'triggers',
    element: <DataMartTriggersContent />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'run-history',
    element: <DataMartRunHistoryContent />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    index: true,
    element: <DataMartOverviewContent />,
    errorElement: <LayoutErrorBoundary />,
  },
];
