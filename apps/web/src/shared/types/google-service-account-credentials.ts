import type { DataDestination } from '../../features/data-destination';

export interface GoogleServiceAccountCredentials {
  serviceAccount: string;
}

export function isGoogleServiceAccountCredentials(
  credentials: DataDestination['credentials']
): credentials is GoogleServiceAccountCredentials {
  return 'serviceAccount' in credentials && Boolean(credentials.serviceAccount);
}
