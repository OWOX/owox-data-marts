import type { DataDestination } from './data-destination.ts';

export interface EmailCredentials {
  to: string[];
}

export function isEmailCredentials(
  credentials: DataDestination['credentials']
): credentials is EmailCredentials {
  return 'to' in credentials;
}
