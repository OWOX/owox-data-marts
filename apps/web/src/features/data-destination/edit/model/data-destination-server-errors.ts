import type { FieldPath } from 'react-hook-form';
import { extractApiError, extractApiFieldErrors, type ApiFieldError } from '../../../../app/api';
import { type DataDestinationFormData, DataDestinationType } from '../../shared';

/** The backend's code for a Drive folder the service account cannot use. */
const FOLDER_ACCESS_ERROR_CODE = 'DESTINATION_FOLDER_ACCESS';

/** Refusals of the chosen Credential, which the backend sends as a plain message with no code or field. */
const CREDENTIAL_REFUSALS = new Set([
  'You cannot use this Credential.',
  'This Credential is disabled.',
  'This Credential cannot be used with this Destination type.',
]);

/**
 * The values a rejected Destination save names. Besides the per-input list, a Drive folder the
 * service account cannot use comes back as a plain error with its own code — with a sentence
 * that says exactly what to change about the folder, so it belongs under the folder input. A
 * refused Credential belongs under the Credential field.
 */
export function extractDestinationFieldErrors(error: unknown): ApiFieldError[] {
  const fieldErrors = extractApiFieldErrors(error);
  const { code, message } = extractApiError(error);
  if (code === FOLDER_ACCESS_ERROR_CODE && message) {
    // Addressed to the input that holds the folder (its URL), not to the `folderId` the request
    // derives from it: it is the same value, so the sentence needs no key named in front of it.
    return [...fieldErrors, { field: 'config.folderUrl', message }];
  }
  if (message && CREDENTIAL_REFUSALS.has(message)) {
    return [...fieldErrors, { field: 'reusableCredentialId', message }];
  }
  return fieldErrors;
}

/**
 * Maps a value the server rejected — named by its path in the save request — to the Destination
 * form input that holds it, or `null` when no input does.
 *
 * Where request and form differ: Google Sheets sends the folder as `config.folderId` while the
 * form takes its URL. A list (`credentials.to.0`) is one input, whichever entry was refused.
 */
export function toDataDestinationFormField(
  type: DataDestinationType | undefined,
  field: string
): FieldPath<DataDestinationFormData> | null {
  if (field === 'reusableCredentialId') return 'reusableCredentialId';
  const segments = field.split('.').filter(segment => !/^\d+$/.test(segment));
  const [scope, key] = segments;
  if ((scope !== 'config' && scope !== 'credentials') || !key) return null;
  // The credentials' own type tag is set by the form, never typed: nothing to mark for it.
  if (scope === 'credentials' && key === 'type') return null;

  if (
    type === DataDestinationType.GOOGLE_SHEETS &&
    scope === 'config' &&
    (key === 'folderId' || key === 'folderUrl')
  ) {
    return 'config.folderUrl';
  }

  return `${scope}.${key}` as FieldPath<DataDestinationFormData>;
}
