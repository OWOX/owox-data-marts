import type { RouteObject } from 'react-router-dom';
import DataMartOverviewContent from './DataMartOverviewContent.tsx';
import DataMartDataSetupContent from './DataMartDataSetupContent.tsx';
import DataMartDestinationsContent from './DataMartDestinationsContent.tsx';

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
    path: 'destinations',
    element: <DataMartDestinationsContent />,
  },
  {
    index: true,
    element: <DataMartOverviewContent />,
  },
];
