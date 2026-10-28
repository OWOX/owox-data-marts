import { DataStorageMapper } from './data-storage.mapper';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import type { DataStorage } from '../entities/data-storage.entity';
import type { StorageCredentialSummary } from '../data-storage-types/storage-credential-state';
import type { AuthorizationContext } from '../../idp';
import type { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { AUTH_CONTEXT } from '../../idp/guards/idp.guard';

const storage = {
  id: 'storage-1',
  title: 'Warehouse',
  type: DataStorageType.GOOGLE_BIGQUERY,
  projectId: 'proj-1',
  config: { projectId: 'gcp-1', location: 'US' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  modifiedAt: new Date('2026-01-02T00:00:00Z'),
  credentialId: 'old-row-1',
  availableForUse: true,
  availableForMaintenance: true,
  contexts: [],
} as unknown as DataStorage;

const visible: StorageCredentialSummary = {
  access: 'visible',
  id: 'cred-1',
  title: 'Analytics SA',
  definitionId: 'google-service-account',
  providerName: 'Google service account',
  identity: 'sa@gcp-1.iam.gserviceaccount.com',
  state: 'ready',
};

/** The request's authorization context as the IdP guard leaves it in CLS. */
function clsWith(authFlow?: string) {
  return {
    isActive: () => authFlow !== undefined,
    get: (key: string) => (key === AUTH_CONTEXT ? { authFlow } : undefined),
  } as never;
}

describe('DataStorageMapper', () => {
  const mapper = new DataStorageMapper(clsWith());

  describe('toApiResponse', () => {
    it('carries the Credential summary and no key data', async () => {
      const response = await mapper.toApiResponse(
        mapper.toDomainDto(storage, 0, 0, null, [], undefined, visible)
      );

      expect(response.reusableCredential).toEqual(visible);
      expect(response).not.toHaveProperty('credentials');
      expect(response).not.toHaveProperty('credentialId');
    });

    it('gives a restricted Credential no title or identity', async () => {
      const leaky = {
        access: 'restricted',
        state: 'disabled',
        title: 'Hidden',
        identity: 'hidden@example.com',
      } as unknown as StorageCredentialSummary;

      const response = await mapper.toApiResponse(
        mapper.toDomainDto(storage, 0, 0, null, [], undefined, leaky)
      );

      expect(response.reusableCredential).toEqual({ access: 'restricted', state: 'disabled' });
    });

    it('answers null for an unbound Storage', async () => {
      const response = await mapper.toApiResponse(
        mapper.toDomainDto(storage, 0, 0, null, [], undefined, null)
      );

      expect(response.reusableCredential).toBeNull();
    });

    it('leaves the summary out where the Storage is embedded without one', async () => {
      const response = await mapper.toApiResponse(mapper.toDomainDto(storage));

      expect(response).not.toHaveProperty('reusableCredential');
      expect(response).not.toHaveProperty('credentials');
      expect(response).not.toHaveProperty('credentialId');
    });
  });

  it('lists Storages with their Credential summaries', () => {
    const [item] = mapper.toResponseList([
      mapper.toDomainDto(storage, 0, 0, null, [], undefined, visible),
    ]);

    expect(item.reusableCredential).toEqual(visible);
  });

  it('hides which Credential a Storage uses from a plugin request', async () => {
    const pluginMapper = new DataStorageMapper(clsWith('plugin'));
    const dto = pluginMapper.toDomainDto(storage, 0, 0, null, [], undefined, visible);

    expect((await pluginMapper.toApiResponse(dto)).reusableCredential).toEqual({
      access: 'restricted',
      state: 'ready',
    });
    expect(pluginMapper.toResponseList([dto])[0].reusableCredential).toEqual({
      access: 'restricted',
      state: 'ready',
    });
  });

  it('says a Storage still runs on its own key, to members and plugins alike', async () => {
    const pending: StorageCredentialSummary = { access: 'pending', state: 'ready' };
    for (const authFlow of [undefined, 'plugin']) {
      const flowMapper = new DataStorageMapper(clsWith(authFlow));
      const dto = flowMapper.toDomainDto(storage, 0, 0, null, [], undefined, pending);

      expect((await flowMapper.toApiResponse(dto)).reusableCredential).toEqual(pending);
      expect(flowMapper.toResponseList([dto])[0].reusableCredential).toEqual(pending);
    }
  });

  it('shows the Credential to a member request, whatever its auth flow', async () => {
    const apiKeyMapper = new DataStorageMapper(clsWith('api_key'));
    const dto = apiKeyMapper.toDomainDto(storage, 0, 0, null, [], undefined, visible);

    expect((await apiKeyMapper.toApiResponse(dto)).reusableCredential).toEqual(visible);
    expect(apiKeyMapper.toResponseList([dto])[0].reusableCredential).toEqual(visible);
  });

  describe('toUpdateCommand', () => {
    const context = { projectId: 'proj-1', userId: 'user-1', roles: ['editor'] };
    const body = { title: ' Warehouse ', config: {} } as UpdateDataStorageApiDto;

    it.each([
      ['credentials', { credentials: { type: 'service_account' } }],
      ['credentialId', { credentialId: null }],
      ['sourceStorageId', { sourceStorageId: 'storage-2' }],
    ])('marks a request that sends %s', (_field, extra) => {
      const command = mapper.toUpdateCommand(
        'storage-1',
        context as AuthorizationContext,
        {
          ...body,
          ...extra,
        } as UpdateDataStorageApiDto
      );

      expect(command.sentOldCredentialFields).toBe(true);
    });

    it('passes reusableCredentialId, null included, and marks plugin authentication', () => {
      const command = mapper.toUpdateCommand(
        'storage-1',
        { ...context, authFlow: 'plugin' } as AuthorizationContext,
        { ...body, reusableCredentialId: null } as unknown as UpdateDataStorageApiDto
      );

      expect(command.reusableCredentialId).toBeNull();
      expect(command.sentOldCredentialFields).toBe(false);
      expect(command.isPluginAuth).toBe(true);
    });
  });

  describe('toByTypeCommand', () => {
    const context = { projectId: 'proj-1', userId: 'user-1', roles: ['editor'] };

    it.each([
      ['a member', undefined, false],
      ['a plugin', 'plugin', true],
    ])('carries the member and whether %s calls', (_who, authFlow, isPluginCall) => {
      const command = new DataStorageMapper(clsWith(authFlow)).toByTypeCommand(
        context as AuthorizationContext,
        DataStorageType.SNOWFLAKE
      );

      expect(command).toEqual({
        projectId: 'proj-1',
        type: DataStorageType.SNOWFLAKE,
        userId: 'user-1',
        roles: ['editor'],
        isPluginCall,
      });
    });
  });
});
