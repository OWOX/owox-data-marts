/**
 * Utility functions for working with service account credentials
 */

import type { GoogleServiceAccount } from '../../../../../shared/types';

/**
 * Extracts a specific parameter from a service account JSON string
 * @param serviceAccountJson - The service account JSON string
 * @param paramName - The name of the parameter to extract
 * @param defaultValue - Optional default value to return if parameter is not found or JSON is invalid
 * @returns The extracted parameter value or the default value
 */
export function extractServiceAccountParam<T>(
  serviceAccountJson: string,
  paramName: string,
  defaultValue?: T
): T | undefined {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson) as GoogleServiceAccount;

    if (paramName in serviceAccount) {
      return serviceAccount[paramName] as T;
    }

    // Return the default value if the parameter doesn't exist
    return defaultValue;
  } catch (error) {
    // Return the default value if JSON parsing fails
    console.error(`Error parsing service account JSON: ${String(error)}`);
    return defaultValue;
  }
}

/**
 * Extracts the client email from a service account JSON string
 * @param serviceAccountJson - The service account JSON string
 * @returns The client email or undefined if not found or JSON is invalid
 */
export function extractServiceAccountEmail(serviceAccountJson: string): string | undefined {
  return extractServiceAccountParam<string>(serviceAccountJson, 'client_email');
}
