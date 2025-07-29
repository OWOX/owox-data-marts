import type { DataDestination } from './data-destination.ts';

export interface LookerStudioCredentials {
  urlHost: string;
  secretKey?: string;
}

export function isLookerStudioCredentials(
  credentials: DataDestination['credentials']
): credentials is LookerStudioCredentials {
  return 'urlHost' in credentials;
}
