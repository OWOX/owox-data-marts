import { DataDestinationType } from '../../../../data-destination';
import type { DataDestination } from '../../../../data-destination';

/**
 * The email address that should be granted access to the Google Sheet of a Google Sheets
 * destination: the identity of its Credential (service account email or Google account email),
 * also when the member cannot see the Credential or the Destination still uses its own key.
 */
export function getGoogleSheetsDestinationEmail(destination: DataDestination): string | undefined {
  if (destination.type !== DataDestinationType.GOOGLE_SHEETS) {
    return undefined;
  }
  return destination.reusableCredential?.identity ?? undefined;
}
