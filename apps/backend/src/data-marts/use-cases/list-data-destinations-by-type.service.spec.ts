import { ListDataDestinationsByTypeCommand } from '../dto/domain/list-data-destinations-by-type.command';
import { ListDataDestinationsByTypeService } from './list-data-destinations-by-type.service';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';

describe('ListDataDestinationsByTypeService', () => {
  const makeQbChain = (rawResults: unknown[]) => {
    const qb = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      groupBy: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue(rawResults),
    };
    // Make chainable
    qb.leftJoin.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.select.mockReturnValue(qb);
    qb.addSelect.mockReturnValue(qb);
    qb.groupBy.mockReturnValue(qb);
    return qb;
  };

  const createService = (destinations: unknown[], reportRaw: unknown[]) => {
    const qb = makeQbChain(reportRaw);

    const dataDestinationRepo = {
      find: jest.fn().mockResolvedValue(destinations),
    };
    const reportRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const service = new ListDataDestinationsByTypeService(
      dataDestinationRepo as never,
      reportRepo as never
    );

    return { service, dataDestinationRepo, reportRepo, qb };
  };

  const projectId = 'proj-1';
  const type = DataDestinationType.GOOGLE_SHEETS;

  it('returns items with correct fields when destinations exist with credentials', async () => {
    const destinations = [
      {
        id: 'dest-1',
        title: 'My Sheets Destination',
        type,
        credentialId: 'cred-1',
        credential: { identity: { email: 'user@example.com' } },
      },
    ];
    const reportRaw = [{ destinationId: 'dest-1', dataMartName: 'My Data Mart' }];

    const { service } = createService(destinations, reportRaw);
    const command = new ListDataDestinationsByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'dest-1',
      title: 'My Sheets Destination',
      dataMartName: 'My Data Mart',
      identity: { email: 'user@example.com' },
    });
  });

  it('returns empty array when no destinations match', async () => {
    const { service } = createService([], []);
    const command = new ListDataDestinationsByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(result).toEqual([]);
  });

  it('returns dataMartName as null when no Report references the destination', async () => {
    const destinations = [
      {
        id: 'dest-2',
        title: 'Unused Destination',
        type,
        credentialId: 'cred-2',
        credential: { identity: null },
      },
    ];

    const { service } = createService(destinations, []); // no Report rows
    const command = new ListDataDestinationsByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(result).toHaveLength(1);
    expect(result[0].dataMartName).toBeNull();
  });

  it('returns identity from credential.identity', async () => {
    const identity = { clientEmail: 'sa@project.iam.gserviceaccount.com' };
    const destinations = [
      {
        id: 'dest-3',
        title: 'SA Destination',
        type,
        credentialId: 'cred-3',
        credential: { identity },
      },
    ];

    const { service } = createService(destinations, []);
    const command = new ListDataDestinationsByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(result[0].identity).toEqual(identity);
  });

  it('returns empty array for unknown type string (no error)', async () => {
    const { service, dataDestinationRepo } = createService([], []);
    dataDestinationRepo.find.mockResolvedValue([]);

    const command = new ListDataDestinationsByTypeCommand(projectId, 'UNKNOWN_TYPE' as never);

    const result = await service.run(command);

    expect(result).toEqual([]);
  });

  it('resolves dataMartName via Report join (not direct DataMart join)', async () => {
    const destinations = [
      {
        id: 'dest-4',
        title: 'Multi-report Destination',
        type,
        credentialId: 'cred-4',
        credential: { identity: null },
      },
    ];
    // Report query returns first dataMartName alphabetically (MIN)
    const reportRaw = [{ destinationId: 'dest-4', dataMartName: 'Alpha Mart' }];

    const { service, reportRepo } = createService(destinations, reportRaw);
    const command = new ListDataDestinationsByTypeCommand(projectId, type);

    const result = await service.run(command);

    expect(reportRepo.createQueryBuilder).toHaveBeenCalled();
    expect(result[0].dataMartName).toBe('Alpha Mart');
  });
});
