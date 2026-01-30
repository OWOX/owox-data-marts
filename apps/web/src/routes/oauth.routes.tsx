import type { RouteObject } from 'react-router-dom';
import { GoogleOAuthCallbackPage } from '../features/google-oauth/pages/GoogleOAuthCallbackPage';
import * as Pages from '../pages/oauth';

export const oauthRoutes: RouteObject = {
  path: 'oauth',
  children: [
    {
      path: 'tiktok-ads/callback',
      Component: Pages.TikTokCallback,
    },
    {
      path: 'microsoft-ads/callback',
      Component: Pages.MicrosoftCallback,
    },
    {
      path: 'google/callback',
      element: <GoogleOAuthCallbackPage />,
    },
  ],
};
