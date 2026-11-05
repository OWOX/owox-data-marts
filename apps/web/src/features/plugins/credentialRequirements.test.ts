import { describe, expect, it } from 'vitest';
import type { NormalizedPluginCredentialRequirement } from '../credentials/types';
import { grantedCredentialId, grantedCredentialSelections } from './credentialRequirements';

const requirement = (key: string, optional = false): NormalizedPluginCredentialRequirement => ({
  key,
  definitionId: key,
  optional,
  models: [],
  scopes: [],
});

describe('grantedCredentialSelections', () => {
  const requirements = [requirement('github'), requirement('backup', true)];

  it('decides nothing when the grants are unknown', () => {
    expect(grantedCredentialSelections(requirements, undefined)).toEqual({});
  });

  it('leaves a required requirement granted nothing undecided, and an optional one Do not grant', () => {
    expect(grantedCredentialSelections(requirements, {})).toEqual({ backup: null });
  });

  it('keeps each declared grant and drops the ones the version no longer declares', () => {
    expect(
      grantedCredentialSelections(requirements, { github: 'c1', removed: 'c2', backup: 'c3' })
    ).toEqual({ github: 'c1', backup: 'c3' });
  });

  it('reads a requirement named like an Object member as ungranted', () => {
    expect(grantedCredentialSelections([requirement('constructor', true)], {})).toEqual({
      constructor: null,
    });
    expect(grantedCredentialId({}, 'toString')).toBeUndefined();
  });
});
