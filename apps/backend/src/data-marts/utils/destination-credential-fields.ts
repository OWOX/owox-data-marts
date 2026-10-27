import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import { DESTINATION_CREDENTIAL_DEFINITION_IDS } from '../data-destination-types/destination-credential-definitions';
import {
  DataDestinationType,
  requiresCredentials,
  toHumanReadable,
} from '../data-destination-types/enums/data-destination-type.enum';

export const PLUGIN_CREDENTIAL_CHANGE_MESSAGE = "Plugins cannot change a Destination's Credential.";

export interface DestinationCredentialFields {
  readonly credentials?: DataDestinationCredentials;
  /** Absent keeps the binding; null is rejected. */
  readonly reusableCredentialId?: string | null;
  /** True when the request carries `credentialId` or `sourceDestinationId`. */
  readonly sentOldCredentialFields: boolean;
  readonly isPluginCall: boolean;
}

/** Plugins first, then the shape of the request, before any lookup; returns the credentials to store. */
export function checkDestinationCredentialFields(
  type: DataDestinationType,
  fields: DestinationCredentialFields
): DataDestinationCredentials | undefined {
  const { reusableCredentialId } = fields;
  const credentials = isKeylessSheetsCredentials(type, fields.credentials)
    ? undefined
    : fields.credentials;
  if (reusableCredentialId !== undefined && fields.isPluginCall) {
    throw new ForbiddenException(PLUGIN_CREDENTIAL_CHANGE_MESSAGE);
  }
  if (reusableCredentialId === null) {
    throw new BadRequestException('reusableCredentialId cannot be null.');
  }
  if (fields.sentOldCredentialFields || isKeyACredentialHolds(type, credentials)) {
    throw new BadRequestException('This page is out of date. Reload it.');
  }
  if (credentials && !requiresCredentials(type)) {
    throw new BadRequestException(`${toHumanReadable(type)} destinations do not use credentials`);
  }
  if (reusableCredentialId === undefined) return credentials;
  if (!DESTINATION_CREDENTIAL_DEFINITION_IDS[type]) {
    throw new BadRequestException(`${toHumanReadable(type)} destinations do not use a Credential.`);
  }
  if (credentials) {
    throw new BadRequestException('Send reusableCredentialId without credentials.');
  }
  return undefined;
}

// Older pages send it with no key when the Destination uses a Google account.
function isKeylessSheetsCredentials(
  type: DataDestinationType,
  credentials: DataDestinationCredentials | undefined
): boolean {
  return (
    type === DataDestinationType.GOOGLE_SHEETS &&
    credentials?.type === 'google-sheets-credentials' &&
    Object.keys(credentials).length === 1
  );
}

/** Any Google Sheets key, or a Google Chat webhook URL: a Credential holds it now. */
function isKeyACredentialHolds(
  type: DataDestinationType,
  credentials: DataDestinationCredentials | undefined
): boolean {
  if (!credentials) return false;
  return (
    type === DataDestinationType.GOOGLE_SHEETS ||
    (type === DataDestinationType.GOOGLE_CHAT && credentials.type === 'google-chat-credentials')
  );
}
