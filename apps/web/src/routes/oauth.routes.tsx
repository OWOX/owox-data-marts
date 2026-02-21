import type { RouteObject } from 'react-router-dom';
import { TikTokCallback } from '../pages/oauth';
import { GoogleOAuthCallbackPage } from '../features/google-oauth/pages/GoogleOAuthCallbackPage';

export const oauthRoutes: RouteObject = {
  path: 'oauth',
  children: [
    {
      path: 'tiktok/callback',
      element: <TikTokCallback />,
    },
    {
      path: 'google/callback',
      element: <GoogleOAuthCallbackPage />,
    },
  ],
};
