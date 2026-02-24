import type { RouteObject } from 'react-router-dom';
import { GoogleOAuthCallbackPage } from '../features/google-oauth/pages/GoogleOAuthCallbackPage';
import { TikTokCallback, MicrosoftCallback } from '../pages/oauth';

export const oauthRoutes: RouteObject = {
  path: 'oauth',
  children: [
    {
      path: 'tiktok/callback',
      Component: TikTokCallback,
    },
    {
      path: 'microsoft-ads/callback',
      Component: MicrosoftCallback,
    },
    {
      path: 'google/callback',
      element: <GoogleOAuthCallbackPage />,
    },
  ],
};
