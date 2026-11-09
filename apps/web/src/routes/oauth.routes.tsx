import type { RouteObject } from 'react-router';
import { GoogleOAuthCallbackPage } from '../features/google-oauth/pages/GoogleOAuthCallbackPage';
import {
  TikTokCallback,
  MicrosoftCallback,
  MicrosoftAdsGoogleCallback,
  GoogleAdsCallback,
  GoogleSheetsCallback,
  LinkedInCallback,
} from '../pages/oauth';

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
      path: 'microsoft-ads-google/callback',
      element: <MicrosoftAdsGoogleCallback />,
    },
    {
      path: 'google-ads/callback',
      element: <GoogleAdsCallback />,
    },
    {
      path: 'google-sheets/callback',
      element: <GoogleSheetsCallback />,
    },
    {
      path: 'google/callback',
      element: <GoogleOAuthCallbackPage />,
    },
    {
      path: 'linkedin-ads/callback',
      element: <LinkedInCallback />,
    },
    {
      path: 'linkedin-pages/callback',
      element: <LinkedInCallback />,
    },
  ],
};
