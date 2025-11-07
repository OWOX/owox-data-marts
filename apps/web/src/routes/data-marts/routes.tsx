import type { RouteObject } from 'react-router-dom';
import DataMartOverviewContent from '../../pages/data-marts/edit/DataMartOverviewContent.tsx';
import DataMartDataSetupContent from '../../pages/data-marts/edit/DataMartDataSetupContent.tsx';
import DataMartDestinationsContent from '../../pages/data-marts/edit/DataMartDestinationsContent.tsx';
import DataMartRunHistoryContent from '../../pages/data-marts/edit/DataMartRunHistoryContent.tsx';
import DataMartInsightsContent from '../../pages/data-marts/edit/DataMartInsightsContent.tsx';
import DataMartTriggersContent from '../../pages/data-marts/edit/DataMartTriggersContent.tsx';
import InsightsListView from '../../pages/data-marts/insights/list/InsightsListView.tsx';
import InsightDetailsView from '../../pages/data-marts/insights/details/InsightDetailsView.tsx';

export const dataMartDetailsRoutes: RouteObject[] = [
  {
    path: 'overview',
    element: <DataMartOverviewContent />,
  },
  {
    path: 'data-setup',
    element: <DataMartDataSetupContent />,
  },
  {
    path: 'reports',
    element: <DataMartDestinationsContent />,
  },
  {
    path: 'insights',
    element: <DataMartInsightsContent />,
    children: [
      { index: true, element: <InsightsListView /> },
      { path: ':insightId', element: <InsightDetailsView /> },
    ],
  },
  {
    path: 'triggers',
    element: <DataMartTriggersContent />,
  },
  {
    path: 'run-history',
    element: <DataMartRunHistoryContent />,
  },
  {
    index: true,
    element: <DataMartOverviewContent />,
  },
];
