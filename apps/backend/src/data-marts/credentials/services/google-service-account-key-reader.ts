// Imported by migration 1793000000000: keep it and its imports free of Nest and runtime services.
import { createPrivateKey } from 'node:crypto';
import {
  GoogleServiceAccountKeySchema,
  type GoogleServiceAccountKey,
} from '../../../common/schemas/google-service-account-key.schema';
import type { GoogleServiceAccountPublicMetadata } from '../credential.types';

/** The key and what a Credential shows of it, or why it is refused; a reason never quotes the key. */
export function readGoogleServiceAccountKey(value: string):
  | {
      readonly key: GoogleServiceAccountKey;
      readonly metadata: GoogleServiceAccountPublicMetadata;
    }
  | string {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return 'The key is not valid JSON';
  }

  const parsed = GoogleServiceAccountKeySchema.safeParse(raw);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  }
  const key = parsed.data;

  if (!key.client_email.toLowerCase().endsWith('.gserviceaccount.com')) {
    return 'client_email must be a service account address';
  }
  let rsa = false;
  try {
    rsa = createPrivateKey(key.private_key).asymmetricKeyType === 'rsa';
  } catch {
    // An unreadable key is reported as not RSA below.
  }
  if (!rsa) {
    return 'private_key must be an RSA key';
  }
  if (key.universe_domain !== 'googleapis.com') {
    return 'Only the googleapis.com universe is supported';
  }

  return {
    key,
    metadata: {
      clientEmail: key.client_email,
      projectId: key.project_id,
      privateKeyId: key.private_key_id,
      clientId: key.client_id,
    },
  };
}
