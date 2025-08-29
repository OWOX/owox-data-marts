import type { RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import About from '../pages/About';
import NotFound from '../pages/NotFound';
import DataMartsPage from '../pages/data-marts/list/DataMartsPage.tsx';
import { DataMartDetailsPage } from '../pages/data-marts/edit';
import CreateDataMartPage from '../pages/data-marts/create/CreateDataMartPage.tsx';
import { DataStorageListPage } from '../pages/data-storage';
import { DataDestinationListPage } from '../pages/data-destination/DataDestinationListPage';
import { dataMartDetailsRoutes } from './data-marts/routes';
import { ProjectRedirect } from '../components/ProjectRedirect';

const routes: RouteObject[] = [
  {
    index: true,
    path: '/',
    element: <ProjectRedirect />,
  },
  {
    path: '/ui/:projectId',
    element: <MainLayout />,
    children: [
      {
        path: '/ui/:projectId/about',
        element: <About />,
      },
      {
        index: true,
        path: '/ui/:projectId/data-marts',
        element: <DataMartsPage />,
      },
      {
        path: '/ui/:projectId/data-marts/create',
        element: <CreateDataMartPage />,
      },
      {
        path: '/ui/:projectId/data-marts/:id',
        element: <DataMartDetailsPage />,
        children: dataMartDetailsRoutes,
      },
      {
        path: '/ui/:projectId/data-storages',
        element: <DataStorageListPage />,
      },
      {
        path: '/ui/:projectId/data-destinations',
        element: <DataDestinationListPage />,
      },
      {
        path: '/ui/:projectId/*',
        element: <NotFound />,
      },
    ],
  },
  // Fallback for any other routes - redirect to home
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;
