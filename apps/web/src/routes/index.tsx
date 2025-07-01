import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import About from '../pages/About';
import NotFound from '../pages/NotFound';
import DataMartsPage from '../pages/data-marts/list/DataMartsPage.tsx';
import { DataMartDetailsPage } from '../pages/data-marts/edit';
import CreateDataMartPage from '../pages/data-marts/create/CreateDataMartPage.tsx';
import { DataStorageListPage } from '../pages/data-storage';
import { DataDestinationListPage } from '../pages/data-destination/DataDestinationListPage';
import { dataMartDetailsRoutes } from './data-marts/routes';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Navigate to='/data-marts' replace />,
      },
      {
        path: 'about',
        element: <About />,
      },
      {
        path: 'data-marts',
        element: <DataMartsPage />,
      },
      {
        path: 'data-marts/create',
        element: <CreateDataMartPage />,
      },
      {
        path: 'data-marts/:id',
        element: <DataMartDetailsPage />,
        children: dataMartDetailsRoutes,
      },
      {
        path: 'data-storages',
        element: <DataStorageListPage />,
      },
      {
        path: 'data-destinations',
        element: <DataDestinationListPage />,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
];

export default routes;
