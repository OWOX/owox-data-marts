import type { RouteObject } from 'react-router-dom';
import DataMartOverviewContent from '../../pages/data-marts/edit/DataMartOverviewContent.tsx';
import DataMartDataSetupContent from '../../pages/data-marts/edit/DataMartDataSetupContent.tsx';
import DataMartDestinationsContent from '../../pages/data-marts/edit/DataMartDestinationsContent.tsx';
import { DataMartTriggersContent } from '../../pages/data-marts/edit/DataMartTriggersContent.tsx';
import DataMartRunHistoryContent from '../../pages/data-marts/edit/DataMartRunHistoryContent.tsx';

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
