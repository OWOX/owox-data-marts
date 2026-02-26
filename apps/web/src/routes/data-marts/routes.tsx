import type { RouteObject } from 'react-router-dom';
import DataMartOverviewContent from '../../pages/data-marts/edit/DataMartOverviewContent.tsx';
import DataMartDataSetupContent from '../../pages/data-marts/edit/DataMartDataSetupContent.tsx';
import DataMartDestinationsContent from '../../pages/data-marts/edit/DataMartDestinationsContent.tsx';
import DataMartRunHistoryContent from '../../pages/data-marts/edit/DataMartRunHistoryContent.tsx';
import DataMartInsightsContent from '../../pages/data-marts/edit/DataMartInsightsContent.tsx';
import DataMartInsightArtifactsContent from '../../pages/data-marts/edit/DataMartInsightArtifactsContent.tsx';
import DataMartInsightTemplatesContent from '../../pages/data-marts/edit/DataMartInsightTemplatesContent.tsx';
import DataMartTriggersContent from '../../pages/data-marts/edit/DataMartTriggersContent.tsx';
import InsightsListView from '../../features/data-marts/insights/components/InsightsListView.tsx';
import InsightDetailsView from '../../features/data-marts/insights/components/InsightDetailsView.tsx';
import {
  InsightArtifactsListView,
  InsightArtifactDetailsView,
} from '../../features/data-marts/insight-artifacts';
import {
  InsightTemplatesListView,
  InsightTemplateDetailsView,
} from '../../features/data-marts/insight-templates';

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
    path: 'insights',
    element: <DataMartInsightsContent />,
    children: [
      { index: true, element: <InsightsListView /> },
      { path: ':insightId', element: <InsightDetailsView /> },
    ],
  },
  {
    path: 'insight-artifacts',
    element: <DataMartInsightArtifactsContent />,
    children: [
      { index: true, element: <InsightArtifactsListView /> },
      { path: ':insightArtifactId', element: <InsightArtifactDetailsView /> },
    ],
  },
  {
    path: 'insight-templates',
    element: <DataMartInsightTemplatesContent />,
    children: [
      { index: true, element: <InsightTemplatesListView /> },
      { path: ':insightTemplateId', element: <InsightTemplateDetailsView /> },
    ],
  },
  {
    path: 'reports',
    element: <DataMartDestinationsContent />,
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
