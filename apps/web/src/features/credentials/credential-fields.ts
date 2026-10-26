import type { CredentialDefinitionField } from './types';

export type CredentialFieldValues = Record<string, string>;

export function buildFieldsCreatePayload(
  fields: readonly CredentialDefinitionField[],
  values: CredentialFieldValues
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const { key } of fields) {
    if ((values[key] ?? '').trim() !== '') payload[key] = values[key];
  }
  return payload;
}

/**
 * Untouched fields are omitted; a cleared optional field is `null`. A cleared required field is
 * left out so the server keeps its value. Saved secrets start empty, so an empty secret is untouched.
 */
export function buildFieldsUpdatePayload(
  fields: readonly CredentialDefinitionField[],
  initial: CredentialFieldValues,
  values: CredentialFieldValues,
  cleared: readonly string[] = []
): Record<string, string | null> | undefined {
  const payload: Record<string, string | null> = {};
  for (const { key, required, secret } of fields) {
    if (secret && !required && cleared.includes(key) && (values[key] ?? '') === '') {
      payload[key] = null;
      continue;
    }
    const next = values[key] ?? '';
    if (next === (initial[key] ?? '')) continue;
    if (next.trim() !== '') payload[key] = next;
    else if (!required && !secret) payload[key] = null;
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function missingRequiredFields(
  fields: readonly CredentialDefinitionField[],
  values: CredentialFieldValues
): string[] {
  return fields
    .filter(({ key, required }) => required && (values[key] ?? '').trim() === '')
    .map(({ key }) => key);
}
