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
import { TikTokCallback } from '../pages/oauth';

const routes: RouteObject[] = [
  {
    index: true,
    path: '/',
    element: <ProjectRedirect />,
  },
  {
    path: '/oauth/tiktok/callback',
    element: <TikTokCallback />,
  },
  {
    path: '/ui/:projectId',
    element: <MainLayout />,
    children: [
      {
        path: 'about',
        element: <About />,
      },
      {
        index: true,
        element: <DataMartsPage />,
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
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;
