// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
import { BadRequestException } from '@nestjs/common';
import { createPrivateKey } from 'node:crypto';
import {
  GoogleServiceAccountKeySchema,
  type GoogleServiceAccountKey,
} from '../../../common/schemas/google-service-account-key.schema';
import type { GoogleServiceAccountPublicMetadata } from '../credential.types';

/** Messages name the failing field, never its value: the value is a private key. */
export function parseGoogleServiceAccountKey(value: string): {
  readonly key: GoogleServiceAccountKey;
  readonly metadata: GoogleServiceAccountPublicMetadata;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new BadRequestException('The key is not valid JSON');
  }

  const parsed = GoogleServiceAccountKeySchema.safeParse(raw);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const path = issue.path.join('.');
    throw new BadRequestException(path ? `${path}: ${issue.message}` : issue.message);
  }
  const key = parsed.data;

  if (!key.client_email.toLowerCase().endsWith('.gserviceaccount.com')) {
    throw new BadRequestException('client_email must be a service account address');
  }
  let rsa = false;
  try {
    rsa = createPrivateKey(key.private_key).asymmetricKeyType === 'rsa';
  } catch {
    // An unreadable key is reported as not RSA below.
  }
  if (!rsa) {
    throw new BadRequestException('private_key must be an RSA key');
  }
  if (key.universe_domain !== 'googleapis.com') {
    throw new BadRequestException('Only the googleapis.com universe is supported');
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
