import { BadRequestException } from '@nestjs/common';
import { Core } from '@owox/connectors';
import { isGoogleChatWebhookUrl } from '../../data-destination-types/google-chat-webhook-url';
import { OLD_ROW_TOKEN_FIELD } from '../../connector-types/source-key-fields';
import { GOOGLE_CHAT_WEBHOOK_DEFINITION_ID } from './builtin-credential-definitions';
import {
  isCustomConnectorMetadata,
  type CredentialDefinitionContract,
  type CustomConnectorFieldSpec,
  type CustomConnectorPublicMetadata,
  type CredentialPublicMetadata,
  type CredentialSecret,
  type SourceConnection,
} from '../credential.types';

type FieldsAuth = Extract<CredentialDefinitionContract['auth'], { type: 'fields' }>;

interface ParsedFields {
  readonly secret: { fields: Record<string, string> };
  readonly publicMetadata: { fields: Record<string, string>; connection?: SourceConnection };
}

const MAX_FIELD_LENGTH = 32_768;
const MAX_CUSTOM_CONNECTOR_ITEMS = 20;
const BARE_HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** Checks a definition's field needs beyond the contract; the error message or null. */
const BUILTIN_FIELD_RULES: Readonly<
  Record<string, Readonly<Record<string, (value: string) => string | null>>>
> = {
  [GOOGLE_CHAT_WEBHOOK_DEFINITION_ID]: {
    webhookUrl: value =>
      isGoogleChatWebhookUrl(value.trim()) ? null : 'Enter a Google Chat incoming webhook URL.',
  },
};

export function builtinFieldRule(definitionId: string, key: string, value: string): string | null {
  return BUILTIN_FIELD_RULES[definitionId]?.[key]?.(value) ?? null;
}

export function parseFieldsForCreate(
  auth: FieldsAuth,
  input: Record<string, unknown> | undefined,
  definitionId: string
): ParsedFields {
  return mergeFields(auth, {}, input ?? {}, definitionId);
}

interface StoredValues {
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
}

/** Omitted keeps, `null` clears; a changed identity needs its stored secrets sent again. */
export function applyFieldsUpdate(
  auth: FieldsAuth,
  current: StoredValues,
  input: Record<string, unknown>,
  definitionId: string
): ParsedFields & { readonly secretChanged: boolean } {
  const stored = storedFields(current);
  requireSecretsWithIdentityChange(auth, stored, input);
  const merged = mergeFields(auth, stored, input, definitionId);
  // Only a reconnect through the connector's sign-in replaces what it recorded.
  const { publicMetadata } = current;
  const connection =
    publicMetadata && 'connection' in publicMetadata ? publicMetadata.connection : undefined;
  return {
    secret: withRotatedToken(merged.secret, current, input),
    publicMetadata: connection ? { ...merged.publicMetadata, connection } : merged.publicMetadata,
    secretChanged: auth.fields.some(
      ({ key, secret, identity }) =>
        own(input, key) !== undefined &&
        (secret || (identity && (input[key] ?? undefined) !== own(stored, key)))
    ),
  };
}

/** A changed identity needs fresh secret values, so stored secrets never follow it elsewhere. */
function requireSecretsWithIdentityChange(
  auth: FieldsAuth,
  stored: Readonly<Record<string, string>>,
  input: Record<string, unknown>
): void {
  const changed = auth.fields.filter(
    ({ key, identity }) =>
      identity && own(input, key) !== undefined && (input[key] ?? undefined) !== own(stored, key)
  );
  const missing = auth.fields.filter(
    ({ key, secret }) => secret && own(stored, key) !== undefined && own(input, key) === undefined
  );
  if (changed.length === 0 || missing.length === 0) return;
  throw new BadRequestException(
    `Enter ${missing.map(f => f.label).join(', ')} again to change ${changed.map(f => f.label).join(', ')}`
  );
}

/** Keys of the secret fields that hold a value; never the values. */
export function secretFieldKeysWithValue(
  auth: CredentialDefinitionContract['auth'],
  current: StoredValues
): string[] {
  if (auth.type === 'custom-connector') {
    const { publicMetadata, secret } = current;
    if (!isCustomConnectorMetadata(publicMetadata) || !('fields' in secret)) return [];
    return publicMetadata.fieldList
      .filter(spec => spec.secret && own(secret.fields, spec.key) !== undefined)
      .map(spec => spec.key);
  }
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
  input: Record<string, unknown>,
  definitionId: string
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
    // Only a sent value: a stored one saved before its rule existed must not block other edits.
    const broken =
      own(input, field.key) === undefined ? null : builtinFieldRule(definitionId, field.key, value);
    if (broken) throw new BadRequestException(broken);
    // A ruled value is stored as checked; other fields keep their whitespace (a PEM key ends in a newline).
    const ruled = BUILTIN_FIELD_RULES[definitionId]?.[field.key] !== undefined;
    (field.secret ? secret : publicFields)[field.key] = ruled ? value.trim() : value;
  }
  return { secret: { fields: secret }, publicMetadata: { fields: publicFields } };
}

function own(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export interface CustomConnectorInput {
  readonly hosts?: unknown;
  readonly fieldList?: unknown;
  readonly fields?: unknown;
}

/** Hosts and field list are fixed here; every listed field needs a value. */
export function parseCustomConnectorForCreate(input: CustomConnectorInput | undefined): {
  readonly secret: { fields: Record<string, string> };
  readonly publicMetadata: CustomConnectorPublicMetadata;
} {
  if (input == null) throw new BadRequestException('Hosts, field list and values are required');
  const hosts = parseHosts(input.hosts);
  const fieldList = parseFieldList(input.fieldList);
  const values = asRecord(input.fields);
  for (const { key, label } of fieldList) {
    if (own(values, key) === undefined) throw new BadRequestException(`${label} is required`);
  }
  return splitValues({ hosts, fieldList, fields: {} }, {}, values);
}

/** Replaces values of keys already in the field list; hosts and the field list stay. */
export function applyCustomConnectorUpdate(
  current: StoredValues,
  input: Record<string, unknown>
): {
  readonly secret: { fields: Record<string, string> };
  readonly publicMetadata: CustomConnectorPublicMetadata;
} {
  const { publicMetadata } = current;
  if (!isCustomConnectorMetadata(publicMetadata)) {
    throw new BadRequestException('This Credential has no custom connector settings');
  }
  const values = splitValues(publicMetadata, storedFields(current), input);
  const secretKeys = publicMetadata.fieldList.filter(spec => spec.secret).map(spec => spec.key);
  return { ...values, secret: withRotatedToken(values.secret, current, input, secretKeys) };
}

/** A token a run rotated survives an edit, unless the edit replaces the refresh token it came from. */
function withRotatedToken(
  secret: { fields: Record<string, string> },
  current: StoredValues,
  input: Record<string, unknown>,
  // A custom connector's refresh parameter can have any name, so any changed secret replaces it.
  anySecretKeys: readonly string[] = []
): { fields: Record<string, string> } {
  const stored = 'fields' in current.secret ? current.secret.fields : {};
  const rotated = own(stored, Core.GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD);
  const replaced = Object.keys(input).some(
    key =>
      (key === 'RefreshToken' || key === 'refresh_token' || anySecretKeys.includes(key)) &&
      input[key] !== own(stored, key)
  );
  if (typeof rotated !== 'string' || replaced) return secret;
  // The old row's token is the base a run's expected values were read with.
  const base = own(stored, OLD_ROW_TOKEN_FIELD);
  return {
    fields: {
      ...secret.fields,
      [Core.GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: rotated,
      ...(typeof base === 'string' ? { [OLD_ROW_TOKEN_FIELD]: base } : {}),
    },
  };
}

function splitValues(
  meta: CustomConnectorPublicMetadata,
  stored: Readonly<Record<string, string>>,
  input: Record<string, unknown>
) {
  // Messages name the key, never its value: the value may be a secret.
  for (const key of Object.keys(input)) {
    if (!meta.fieldList.some(spec => spec.key === key)) {
      throw new BadRequestException(`Unknown field ${key}`);
    }
  }
  const secret: Record<string, string> = {};
  const publicFields: Record<string, string> = {};
  for (const { key, label, secret: isSecret } of meta.fieldList) {
    const value = own(input, key) === undefined ? own(stored, key) : input[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') throw new BadRequestException(`${label} must be a string`);
    if (value.trim() === '') throw new BadRequestException(`${label} cannot be empty`);
    if (value.length > MAX_FIELD_LENGTH) {
      throw new BadRequestException(`${label} must be at most ${MAX_FIELD_LENGTH} characters`);
    }
    (isSecret ? secret : publicFields)[key] = value;
  }
  return {
    secret: { fields: secret },
    publicMetadata: { hosts: meta.hosts, fieldList: meta.fieldList, fields: publicFields },
  };
}

function parseHosts(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CUSTOM_CONNECTOR_ITEMS) {
    throw new BadRequestException(`Enter 1 to ${MAX_CUSTOM_CONNECTOR_ITEMS} hosts`);
  }
  const hosts = raw.map(host => (typeof host === 'string' ? host.trim().toLowerCase() : ''));
  if (hosts.some(host => !BARE_HOSTNAME.test(host))) {
    throw new BadRequestException('A host must be a bare hostname, like api.example.com');
  }
  return [...new Set(hosts)];
}

function parseFieldList(raw: unknown): CustomConnectorFieldSpec[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CUSTOM_CONNECTOR_ITEMS) {
    throw new BadRequestException(`Enter 1 to ${MAX_CUSTOM_CONNECTOR_ITEMS} fields`);
  }
  const keys = new Set<string>();
  return raw.map((item: Partial<Record<keyof CustomConnectorFieldSpec, unknown>> | null) => {
    const { key, label, secret } = item ?? {};
    if (typeof key !== 'string' || !Core.ManifestParser.PARAMETER_NAME_PATTERN.test(key)) {
      throw new BadRequestException(
        'A field key must start with a letter and contain only letters, digits and underscores'
      );
    }
    if (Core.ManifestParser.RESERVED_PARAMETER_NAMES.has(key)) {
      throw new BadRequestException(`Field ${key} uses a name reserved by the connector engine`);
    }
    if (keys.has(key)) throw new BadRequestException(`Duplicate field ${key}`);
    keys.add(key);
    if (typeof label !== 'string' || label.trim() === '' || label.length > 255) {
      throw new BadRequestException(`Field ${key} needs a label of at most 255 characters`);
    }
    if (typeof secret !== 'boolean') {
      throw new BadRequestException(`Field ${key} must say whether it is secret`);
    }
    return { key, label: label.trim(), secret };
  });
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BadRequestException('Values must be an object');
  }
  return raw as Record<string, unknown>;
}
