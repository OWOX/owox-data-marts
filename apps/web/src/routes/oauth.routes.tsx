import type { RouteObject } from 'react-router-dom';
import { TikTokCallback } from '../pages/oauth';

export const oauthRoutes: RouteObject = {
  path: 'oauth',
  children: [
    {
      path: 'tiktok/callback',
      element: <TikTokCallback />,
    },
  ],
};
