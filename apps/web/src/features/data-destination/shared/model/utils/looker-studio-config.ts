/**
 * Utility functions for Looker Studio configuration
 */

import type { LookerStudioCredentials } from '../types/looker-studio-credentials.ts';

/**
 * Generates a JSON configuration string for Looker Studio
 * @returns A formatted JSON string with urlHost and secretKey properties
 * @param credentials
 */
export function generateLookerStudioJsonConfig(credentials: LookerStudioCredentials): string {
  return JSON.stringify(credentials, null, 2);
}
