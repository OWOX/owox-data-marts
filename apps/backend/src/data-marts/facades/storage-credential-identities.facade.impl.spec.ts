import { StorageCredentialIdentitiesFacadeImpl } from './storage-credential-identities.facade.impl';

describe('StorageCredentialIdentitiesFacadeImpl', () => {
  it('hands over bound identities, and old key identities of the unbound Storages only', async () => {
    const storageCredentials = {
      identitiesForStorages: jest
        .fn()
        .mockResolvedValue(new Map([['storage-1', 'loader@warehouse.iam.gserviceaccount.com']])),
    };
    const legacy = {
      identities: jest.fn().mockResolvedValue(new Map([['storage-2', 'ann@example.com']])),
    };
    const facade = new StorageCredentialIdentitiesFacadeImpl(
      storageCredentials as never,
      legacy as never
    );

    await expect(
      facade.identitiesForStorages('project-1', ['storage-1', 'storage-2', 'storage-3'])
    ).resolves.toEqual(
      new Map([
        ['storage-1', 'loader@warehouse.iam.gserviceaccount.com'],
        ['storage-2', 'ann@example.com'],
      ])
    );
    expect(storageCredentials.identitiesForStorages).toHaveBeenCalledWith('project-1', [
      'storage-1',
      'storage-2',
      'storage-3',
    ]);
    expect(legacy.identities).toHaveBeenCalledWith('project-1', ['storage-2', 'storage-3']);
  });
});
