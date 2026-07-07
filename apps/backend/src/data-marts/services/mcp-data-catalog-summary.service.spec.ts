import { McpDataCatalogSummaryMapper } from '../mappers/mcp-data-catalog-summary.mapper';
import { McpDataCatalogSummaryRepository } from '../repositories/mcp-data-catalog-summary.repository';
import { RoleScope } from '../enums/role-scope.enum';
import { McpDataCatalogSummaryService } from './mcp-data-catalog-summary.service';

describe('McpDataCatalogSummaryService', () => {
  it('maps published visible data mart rows and usage counters to candidate DTOs', async () => {
    const repository = {
      listPublishedVisibleDataMartRows: jest.fn().mockResolvedValue([
        {
          id: 'dm-1',
          title: 'Orders',
          description: 'Orders mart',
          modifiedAt: new Date('2026-07-01T10:00:00.000Z'),
        },
      ]),
      countTriggersByDataMartIds: jest.fn().mockResolvedValue(new Map([['dm-1', 2]])),
      countReportsByDataMartIds: jest.fn().mockResolvedValue(new Map([['dm-1', 3]])),
    } as unknown as jest.Mocked<McpDataCatalogSummaryRepository>;
    const service = new McpDataCatalogSummaryService(repository, new McpDataCatalogSummaryMapper());
    const query = {
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
    };

    const result = await service.findPublishedVisibleDataMarts(query);

    expect(repository.listPublishedVisibleDataMartRows).toHaveBeenCalledWith(query);
    expect(repository.countTriggersByDataMartIds).toHaveBeenCalledWith(['dm-1']);
    expect(repository.countReportsByDataMartIds).toHaveBeenCalledWith(['dm-1']);
    expect(result).toEqual([
      {
        id: 'dm-1',
        title: 'Orders',
        description: 'Orders mart',
        reportsCount: 3,
        triggersCount: 2,
        modifiedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ]);
  });

  it('does not load counters when there are no data marts', async () => {
    const repository = {
      listPublishedVisibleDataMartRows: jest.fn().mockResolvedValue([]),
      countTriggersByDataMartIds: jest.fn(),
      countReportsByDataMartIds: jest.fn(),
    } as unknown as jest.Mocked<McpDataCatalogSummaryRepository>;
    const service = new McpDataCatalogSummaryService(repository, new McpDataCatalogSummaryMapper());

    await expect(
      service.findPublishedVisibleDataMarts({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
        roleScope: RoleScope.SELECTED_CONTEXTS,
      })
    ).resolves.toEqual([]);

    expect(repository.countTriggersByDataMartIds).not.toHaveBeenCalled();
    expect(repository.countReportsByDataMartIds).not.toHaveBeenCalled();
  });
});
