// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
import { BadRequestException } from '@nestjs/common';
import { readGoogleServiceAccountKey } from './google-service-account-key-reader';

/** Messages name the failing field, never its value: the value is a private key. */
export function parseGoogleServiceAccountKey(
  value: string
): Exclude<ReturnType<typeof readGoogleServiceAccountKey>, string> {
  const read = readGoogleServiceAccountKey(value);
  if (typeof read === 'string') throw new BadRequestException(read);
  return read;
}
