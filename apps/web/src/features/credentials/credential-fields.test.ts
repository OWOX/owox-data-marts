import { describe, expect, it } from 'vitest';
import { buildFieldsCreatePayload, buildFieldsUpdatePayload } from './credential-fields';
import type { CredentialDefinitionField } from './types';

const field = (key: string, overrides: Partial<CredentialDefinitionField> = {}) => ({
  key,
  label: key,
  input: 'text' as const,
  secret: false,
  required: false,
  identity: false,
  ...overrides,
});

const fields = [
  field('username', { required: true, identity: true }),
  field('password', { input: 'password', secret: true, required: true }),
  field('sessionToken', { input: 'password', secret: true }),
  field('region'),
];

describe('credential fields payload', () => {
  it('sends only filled fields when creating', () => {
    expect(
      buildFieldsCreatePayload(fields, {
        username: 'ann',
        password: 'pw',
        sessionToken: '',
        region: ' ',
      })
    ).toEqual({ username: 'ann', password: 'pw' });
  });

  it('omits untouched fields when updating', () => {
    const initial = { username: 'ann', password: '', sessionToken: '', region: 'eu' };
    expect(buildFieldsUpdatePayload(fields, initial, { ...initial })).toBeUndefined();
  });

  it('sends a changed field and a replaced secret', () => {
    const initial = { username: 'ann', password: '', sessionToken: '', region: 'eu' };
    expect(
      buildFieldsUpdatePayload(fields, initial, { ...initial, username: 'bob', password: 'new' })
    ).toEqual({ username: 'bob', password: 'new' });
  });

  it('sends null for a cleared optional field and keeps a cleared required one out', () => {
    const initial = { username: 'ann', password: '', sessionToken: '', region: 'eu' };
    expect(
      buildFieldsUpdatePayload(fields, initial, { ...initial, region: '', username: '' })
    ).toEqual({ region: null });
  });
});
