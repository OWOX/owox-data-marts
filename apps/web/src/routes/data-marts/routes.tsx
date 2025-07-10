import type { RouteObject } from 'react-router-dom';
import DataMartOverviewContent from '../../pages/data-marts/edit/DataMartOverviewContent.tsx';
import DataMartDataSetupContent from '../../pages/data-marts/edit/DataMartDataSetupContent.tsx';
import DataMartDestinationsContent from '../../pages/data-marts/edit/DataMartDestinationsContent.tsx';
import { DataMartTriggersContent } from '../../pages/data-marts/edit/DataMartTriggersContent.tsx';

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
    index: true,
    element: <DataMartOverviewContent />,
  },
];
