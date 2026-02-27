import type { RouteObject } from 'react-router-dom';
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
  ],
};
