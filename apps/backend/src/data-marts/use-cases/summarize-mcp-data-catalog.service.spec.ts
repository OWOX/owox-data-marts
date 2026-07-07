jest.mock('../services/mcp-data-catalog-summary.service', () => ({
  McpDataCatalogSummaryService: jest.fn(),
}));

jest.mock('../services/data-mart-relationship.service', () => ({
  DataMartRelationshipService: jest.fn(),
}));

import { DataMartStatus } from '../enums/data-mart-status.enum';
import { RoleScope } from '../enums/role-scope.enum';
import type { ContextAccessService } from '../services/context/context-access.service';
import type { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import type { McpDataCatalogSummaryService } from '../services/mcp-data-catalog-summary.service';
import { SummarizeMcpDataCatalogCommand } from '../dto/domain/summarize-mcp-data-catalog.command';
import { SummarizeMcpDataCatalogService } from './summarize-mcp-data-catalog.service';

describe('SummarizeMcpDataCatalogService', () => {
  const makeItem = (
    id: string,
    overrides: Partial<{
      title: string;
      status: DataMartStatus;
      description: string | null;
      modifiedAt: Date;
      reportsCount: number;
      triggersCount: number;
    }> = {}
  ) => ({
    id,
    title: overrides.title ?? id,
    status: overrides.status ?? DataMartStatus.PUBLISHED,
    modifiedAt: overrides.modifiedAt ?? new Date('2026-06-01T00:00:00.000Z'),
    description: overrides.description ?? `${id} description`,
    triggersCount: overrides.triggersCount ?? 0,
    reportsCount: overrides.reportsCount ?? 0,
  });

  const makeRelationship = (
    id: string,
    sourceId: string,
    targetId: string,
    joinConditions = [{ sourceFieldName: 'id', targetFieldName: 'id' }]
  ) => ({
    id,
    sourceDataMartId: sourceId,
    targetDataMartId: targetId,
    joinConditions,
  });

  const createService = (
    items: ReturnType<typeof makeItem>[],
    relationships: ReturnType<typeof makeRelationship>[]
  ) => {
    const catalogSummaryService = {
      findPublishedVisibleDataMarts: jest.fn().mockResolvedValue(items),
    } as unknown as jest.Mocked<McpDataCatalogSummaryService>;
    const relationshipService = {
      findGraphEdgesByProjectIdAndSourceDataMartIds: jest.fn().mockResolvedValue(relationships),
    } as unknown as jest.Mocked<DataMartRelationshipService>;
    const contextAccessService = {
      getRoleScope: jest.fn().mockResolvedValue(RoleScope.SELECTED_CONTEXTS),
    } as unknown as jest.Mocked<ContextAccessService>;

    return {
      service: new SummarizeMcpDataCatalogService(
        catalogSummaryService,
        relationshipService,
        contextAccessService
      ),
      catalogSummaryService,
      relationshipService,
      contextAccessService,
    };
  };

  it('returns published visible data marts ranked by connectivity, usage, and recent update', async () => {
    const longDescription = `${'A'.repeat(320)} trailing`;
    const items = [
      makeItem('dm_a', {
        title: 'A',
        description: longDescription,
        reportsCount: 1,
        triggersCount: 1,
        modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
      }),
      makeItem('dm_b', {
        title: 'B',
        reportsCount: 10,
        triggersCount: 0,
        modifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
      makeItem('dm_c', {
        title: 'C',
        reportsCount: 0,
        triggersCount: 0,
        modifiedAt: new Date('2026-07-02T00:00:00.000Z'),
      }),
    ];
    const relationships = [
      makeRelationship('rel-a-b', 'dm_a', 'dm_b'),
      makeRelationship('rel-b-c', 'dm_b', 'dm_c'),
      makeRelationship('rel-a-c', 'dm_a', 'dm_c'),
      makeRelationship('rel-c-a-cycle', 'dm_c', 'dm_a'),
      makeRelationship('rel-no-join', 'dm_b', 'dm_a', []),
      makeRelationship('rel-hidden-target', 'dm_a', 'dm_hidden'),
    ];
    const { service, catalogSummaryService, relationshipService, contextAccessService } =
      createService(items, relationships);

    const result = await service.run(
      new SummarizeMcpDataCatalogCommand('project-1', 'user-1', ['viewer'])
    );

    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(catalogSummaryService.findPublishedVisibleDataMarts).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
    });
    expect(relationshipService.findGraphEdgesByProjectIdAndSourceDataMartIds).toHaveBeenCalledWith(
      'project-1',
      ['dm_a', 'dm_b', 'dm_c']
    );
    expect(result).toEqual({
      projectId: 'project-1',
      dataMartCount: 3,
      topDataMartsByConnectivity: [
        {
          id: 'dm_a',
          title: 'A',
          description: `${'A'.repeat(300)}...`,
          relationshipCount: 3,
          reportsCount: 1,
          triggersCount: 1,
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'dm_b',
          title: 'B',
          description: 'dm_b description',
          relationshipCount: 2,
          reportsCount: 10,
          triggersCount: 0,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'dm_c',
          title: 'C',
          description: 'dm_c description',
          relationshipCount: 2,
          reportsCount: 0,
          triggersCount: 0,
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
    });
  });
});
