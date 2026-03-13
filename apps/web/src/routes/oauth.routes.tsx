import type { RouteObject } from 'react-router-dom';
import { GoogleOAuthCallbackPage } from '../features/google-oauth/pages/GoogleOAuthCallbackPage';
import { TikTokCallback, MicrosoftCallback, GoogleAdsCallback } from '../pages/oauth';

export const oauthRoutes: RouteObject = {
  path: 'oauth',
  children: [
    {
      path: 'tiktok/callback',
      element: <TikTokCallback />,
    },
    {
      path: 'microsoft-ads/callback',
      element: <MicrosoftCallback />,
    },
    {
      path: 'google-ads/callback',
      element: <GoogleAdsCallback />,
    },
    {
      path: 'google/callback',
      element: <GoogleOAuthCallbackPage />,
    },
  ],
};
