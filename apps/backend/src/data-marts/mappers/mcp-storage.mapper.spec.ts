import { McpStorageMapper } from './mcp-storage.mapper';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';

const mapper = new McpStorageMapper();
const base = {
  id: 'storage',
  title: 'Storage',
  type: DataStorageType.GOOGLE_BIGQUERY,
  config: { projectId: 'my-project', location: 'US', password: 'secret' },
  ownerUsers: [{ userId: 'owner', fullName: 'Name', email: 'a@b.com', secret: 'secret' }],
  contexts: [],
  availableForUse: true,
  availableForMaintenance: false,
  createdAt: new Date('2026-11-04'),
  modifiedAt: new Date('2026-11-04'),
};

describe('McpStorageMapper', () => {
  it('returns only declared configuration and user fields', () => {
    const result = mapper.toStorage(base as never);
    expect(result.configuration).toEqual({ projectId: 'my-project', location: 'US' });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.owners).toEqual([{ userId: 'owner', name: 'Name', email: 'a@b.com' }]);
  });

  it('does not expose restricted Credential identities or extra fields', () => {
    const result = mapper.toStorage({
      ...base,
      reusableCredential: { access: 'restricted', state: 'ready', id: 'hidden', token: 'secret' },
    } as never);
    expect(result.credential).toEqual({ access: 'restricted', state: 'ready' });
    expect(JSON.stringify(result)).not.toContain('hidden');
  });

  it('omits invalid persisted Databricks hosts from safe configuration output', () => {
    expect(
      mapper.toStorage({
        ...base,
        type: DataStorageType.DATABRICKS,
        config: { host: 'https://invalid.example?token=secret', httpPath: '/sql' },
      } as never).configuration
    ).toBeNull();
  });

  it('keeps validation results free of provider messages and reasons', () => {
    expect(
      mapper.toValidation(ValidationResult.failure('Bearer secret', { token: 'secret' }))
    ).toEqual({
      valid: false,
      state: 'validation_failed',
      message:
        'Storage access could not be verified. Check the saved configuration and Credential.',
    });
    expect(mapper.toValidation(ValidationResult.oauthReauthRequired('secret')).state).toBe(
      'reauthorization_required'
    );
  });
});
