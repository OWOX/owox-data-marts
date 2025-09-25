import type { DataDestination } from './data-destination.ts';

export interface LookerStudioCredentials {
  deploymentUrl: string;
  destinationId?: string;
  destinationSecretKey?: string;
}

export function isLookerStudioCredentials(
  credentials: DataDestination['credentials']
): credentials is LookerStudioCredentials {
  return 'deploymentUrl' in credentials;
}
