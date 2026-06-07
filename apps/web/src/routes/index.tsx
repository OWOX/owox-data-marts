import { Navigate, type RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import About from '../pages/About';
import NotFound from '../pages/NotFound';
import DataMartsPage from '../pages/data-marts/list/DataMartsPage.tsx';
import DataMartInsightsPage from '../pages/data-marts/insights/DataMartInsightsPage.tsx';
import DataMartReportsPage from '../pages/data-marts/reports/DataMartReportsPage.tsx';
import DataMartRunsPage from '../pages/data-marts/runs/DataMartRunsPage.tsx';
import DataMartSchedulesPage from '../pages/data-marts/schedules/DataMartSchedulesPage.tsx';
import { DataMartDetailsPage } from '../pages/data-marts/edit';
import CreateDataMartPage from '../pages/data-marts/create/CreateDataMartPage.tsx';
import { DataStorageListPage } from '../pages/data-storage';
import { DataDestinationListPage } from '../pages/data-destination/DataDestinationListPage';
import { ProjectSettingsPage } from '../pages/project-settings/ProjectSettingsPage';
import { ProjectNotificationsPage } from '../pages/notifications/project';
import { RequestAccessPage } from '../pages/request-access/RequestAccessPage';
import { LegacyRequestAccessRedirect } from '../pages/request-access/LegacyRequestAccessRedirect';
import { dataMartDetailsRoutes } from './data-marts/routes';
import { projectSettingsRoutes } from './project-settings/routes';
import { ProjectRedirect } from '../components/ProjectRedirect';
import { oauthRoutes } from './oauth.routes';
import { RootErrorBoundary, LayoutErrorBoundary } from '../components/errors';
import { MyApiKeysPage } from '../features/api-keys/pages/MyApiKeysPage';

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
        path: 'request-access',
        element: <RequestAccessPage />,
        errorElement: <LayoutErrorBoundary />,
      },
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
        path: 'data-marts/runs',
        element: <DataMartRunsPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'data-marts/schedules',
        element: <DataMartSchedulesPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'data-marts/reports',
        element: <DataMartReportsPage />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'data-marts/insights',
        element: <DataMartInsightsPage />,
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
        path: 'project-settings',
        element: <ProjectSettingsPage />,
        errorElement: <LayoutErrorBoundary />,
        children: projectSettingsRoutes,
      },
      // Legacy redirects: old /members and /members/contexts bookmarks land on
      // the new Project Settings page. Kept as thin redirects for one release
      // cycle — remove once internal links are updated.
      {
        path: 'members',
        element: <Navigate to='../project-settings/members' replace />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'members/contexts',
        element: <Navigate to='../project-settings/contexts' replace />,
        errorElement: <LayoutErrorBoundary />,
      },
      {
        path: 'me/api-keys',
        element: <MyApiKeysPage />,
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
    path: '/request-access',
    element: <LegacyRequestAccessRedirect />,
    errorElement: <RootErrorBoundary />,
  },
  {
    path: '*',
    element: <NotFound />,
    errorElement: <RootErrorBoundary />,
  },
];

export default routes;
