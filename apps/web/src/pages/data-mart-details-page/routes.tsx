import type { RouteObject } from 'react-router-dom';
import DataMartOverviewContent from './components/DataMartOverviewContent.tsx';
import DataMartDataSetupContent from './components/DataMartDataSetupContent.tsx';
import DataMartDestinationsContent from './components/DataMartDestinationsContent.tsx';

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
