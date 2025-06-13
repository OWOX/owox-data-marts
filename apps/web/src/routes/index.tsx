import type { RouteObject } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Home from '../pages/Home';
import About from '../pages/About';
import NotFound from '../pages/NotFound';
import DataMartsPage from '../pages/DataMartsPage';
import DataMartDetailsPage, { dataMartDetailsRoutes } from '../pages/data-mart-details-page';
import CreateDataMartPage from '../pages/CreateDataMartPage';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Home />,
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
        path: '*',
        element: <NotFound />,
      },
    ],
  },
];

export default routes;
