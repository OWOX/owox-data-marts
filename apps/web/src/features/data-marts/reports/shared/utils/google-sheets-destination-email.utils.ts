import { DataDestinationType } from '../../../../data-destination';
import type { DataDestination } from '../../../../data-destination';
import { extractServiceAccountEmail } from './service-account.utils';

/**
 * Extracts the email address that should be granted access to the Google Sheet
 * for a given Google Sheets destination.
 *
 * - Service Account: parses client_email from the JSON key.
 * - OAuth: uses the identity.email of the authorized Google account.
 */
export function getGoogleSheetsDestinationEmail(destination: DataDestination): string | undefined {
  if (destination.type !== DataDestinationType.GOOGLE_SHEETS) {
    return undefined;
  }

  if (destination.credentials.serviceAccount) {
    return extractServiceAccountEmail(destination.credentials.serviceAccount);
  }

  if (destination.credentials.identity?.email) {
    return destination.credentials.identity.email;
  }

  return undefined;
}
