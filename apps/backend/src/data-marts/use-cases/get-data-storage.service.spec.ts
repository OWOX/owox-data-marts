jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';
import { GetDataStorageService } from './get-data-storage.service';

describe('GetDataStorageService', () => {
  it('maps the Storage with the Credential summary the member sees', async () => {
    const storage = { id: 'storage-1', projectId: 'p1', createdById: null, ownerIds: [] };
    const summary = { access: 'restricted', state: 'ready' };
    const credentialsResolver = {
      summarize: jest.fn().mockResolvedValue(new Map([['storage-1', summary]])),
    };
    const mapper = { toDomainDto: jest.fn().mockReturnValue({ id: 'storage-1' }) };
    const service = new GetDataStorageService(
      { getByProjectIdAndId: jest.fn().mockResolvedValue(storage) } as never,
      mapper as never,
      {
        fetchUserProjectionsList: jest.fn().mockResolvedValue({ getByUserId: jest.fn() }),
      } as never,
      { canAccess: jest.fn().mockResolvedValue(true) } as never,
      credentialsResolver as never
    );

    await service.run(new GetDataStorageCommand('storage-1', 'p1', 'member-1', ['editor']));

    expect(credentialsResolver.summarize).toHaveBeenCalledWith(
      'p1',
      'member-1',
      ['editor'],
      [storage]
    );
    expect(mapper.toDomainDto).toHaveBeenCalledWith(storage, 0, 0, null, [], undefined, summary);
  });
});
