jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { GetDataDestinationService } from './get-data-destination.service';

describe('GetDataDestinationService', () => {
  it('returns the Destination with its Credential as the member sees it', async () => {
    const destination = {
      id: 'dest-1',
      type: DataDestinationType.GOOGLE_SHEETS,
      createdById: null,
      ownerIds: [],
    };
    const summaries = new Map([['dest-1', { access: 'restricted', state: 'ready' }]]);
    const credentialsResolver = { summarize: jest.fn().mockResolvedValue(summaries) };
    const mapper = { toDomainDto: jest.fn().mockReturnValue({ id: 'dest-1' }) };
    const service = new GetDataDestinationService(
      { getByIdAndProjectId: jest.fn().mockResolvedValue(destination) } as never,
      mapper as never,
      {
        fetchUserProjectionsList: jest.fn().mockResolvedValue({ getByUserId: () => null }),
      } as never,
      { canAccess: jest.fn().mockResolvedValue(true) } as never,
      credentialsResolver as never
    );

    await service.run(new GetDataDestinationCommand('dest-1', 'proj-1', 'user-1', ['viewer']));

    expect(credentialsResolver.summarize).toHaveBeenCalledWith(
      'proj-1',
      'user-1',
      ['viewer'],
      [destination]
    );
    expect(mapper.toDomainDto).toHaveBeenCalledWith(destination, null, [], summaries);
  });
});
