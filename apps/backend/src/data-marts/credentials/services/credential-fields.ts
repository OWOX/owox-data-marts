import { BadRequestException } from '@nestjs/common';
import type {
  CredentialDefinitionContract,
  CredentialPublicMetadata,
  CredentialSecret,
} from '../credential.types';

type FieldsAuth = Extract<CredentialDefinitionContract['auth'], { type: 'fields' }>;

interface ParsedFields {
  readonly secret: { fields: Record<string, string> };
  readonly publicMetadata: { fields: Record<string, string> };
}

const MAX_FIELD_LENGTH = 32_768;

export function parseFieldsForCreate(
  auth: FieldsAuth,
  input: Record<string, unknown> | undefined
): ParsedFields {
  return mergeFields(auth, {}, input ?? {});
}

interface StoredValues {
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
}

/** Omitted keeps, `null` clears; a sent secret field or a new identity replaces the secret. */
export function applyFieldsUpdate(
  auth: FieldsAuth,
  current: StoredValues,
  input: Record<string, unknown>
): ParsedFields & { readonly secretChanged: boolean } {
  const stored = storedFields(current);
  return {
    ...mergeFields(auth, stored, input),
    secretChanged: auth.fields.some(
      ({ key, secret, identity }) =>
        own(input, key) !== undefined &&
        (secret || (identity && (input[key] ?? undefined) !== own(stored, key)))
    ),
  };
}

/** Keys of the secret fields that hold a value; never the values. */
export function secretFieldKeysWithValue(
  auth: CredentialDefinitionContract['auth'],
  current: StoredValues
): string[] {
  if (auth.type !== 'fields') return [];
  const stored = storedFields(current);
  return auth.fields
    .filter(field => field.secret && own(stored, field.key) !== undefined)
    .map(field => field.key);
}

/** Both halves, so a value stays readable after its field's secret flag changes. */
function storedFields(current: StoredValues): Record<string, string> {
  return {
    ...(current.publicMetadata && 'fields' in current.publicMetadata
      ? current.publicMetadata.fields
      : {}),
    ...('fields' in current.secret ? current.secret.fields : {}),
  };
}

function mergeFields(
  auth: FieldsAuth,
  stored: Readonly<Record<string, string>>,
  input: Record<string, unknown>
): ParsedFields {
  // Messages name the field, never its value: the value may be a secret.
  for (const key of Object.keys(input)) {
    if (!auth.fields.some(field => field.key === key)) {
      throw new BadRequestException(`Unknown field ${key}`);
    }
  }
  const secret: Record<string, string> = {};
  const publicFields: Record<string, string> = {};
  for (const field of auth.fields) {
    const value = own(input, field.key) === undefined ? own(stored, field.key) : input[field.key];
    if (value === undefined || value === null) {
      if (field.required) throw new BadRequestException(`${field.label} is required`);
      continue;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field.label} must be a string`);
    }
    if (value.trim() === '') throw new BadRequestException(`${field.label} cannot be empty`);
    if (value.length > MAX_FIELD_LENGTH) {
      throw new BadRequestException(
        `${field.label} must be at most ${MAX_FIELD_LENGTH} characters`
      );
    }
    (field.secret ? secret : publicFields)[field.key] = value;
  }
  return { secret: { fields: secret }, publicMetadata: { fields: publicFields } };
}

function own(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
