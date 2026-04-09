import type { RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import About from '../pages/About';
import NotFound from '../pages/NotFound';
import DataMartsPage from '../pages/data-marts/list/DataMartsPage.tsx';
import { DataMartDetailsPage } from '../pages/data-marts/edit';
import CreateDataMartPage from '../pages/data-marts/create/CreateDataMartPage.tsx';
import { DataStorageListPage } from '../pages/data-storage';
import { DataDestinationListPage } from '../pages/data-destination/DataDestinationListPage';
import { ProjectNotificationsPage } from '../pages/notifications/project';
import { dataMartDetailsRoutes } from './data-marts/routes';
import { ProjectRedirect } from '../components/ProjectRedirect';
import { oauthRoutes } from './oauth.routes';
import { RootErrorBoundary, LayoutErrorBoundary } from '../components/errors';

const routes: RouteObject[] = [
  {
    index: true,
    path: '/',
    element: <ProjectRedirect />,
    errorElement: <RootErrorBoundary />,
  },
  {
    path: '/ui/:projectId',
    element: <MainLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
      {
        path: 'about',
        element: <About />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        index: true,
        element: <DataMartsPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'data-marts',
        element: <DataMartsPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'data-marts/create',
        element: <CreateDataMartPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'data-marts/:id',
        element: <DataMartDetailsPage />,
        errorElement: <LayoutErrorBoundary />,
        children: dataMartDetailsRoutes,
      },
      {
        path: 'data-storages',
        element: <DataStorageListPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'data-destinations',
        element: <DataDestinationListPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'notifications',
        element: <ProjectNotificationsPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
  {
    ...oauthRoutes,
    errorElement: <RootErrorBoundary />,
  },
  {
    path: '*',
    element: <NotFound />,
    errorElement: <RootErrorBoundary />,
  },
];

export default routes;
