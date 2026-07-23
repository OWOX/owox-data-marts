jest.mock('../use-cases/list-data-marts.service', () => ({
  ListDataMartsService: jest.fn(),
}));

jest.mock('../services/data-mart.service', () => ({
  DataMartService: jest.fn(),
}));

jest.mock('../use-cases/get-data-mart.service', () => ({
  GetDataMartService: jest.fn(),
}));

jest.mock('../use-cases/summarize-mcp-data-catalog.service', () => ({
  SummarizeMcpDataCatalogService: jest.fn(),
}));

import { NotFoundException } from '@nestjs/common';
import { BigQueryFieldMode } from '../data-storage-types/bigquery/enums/bigquery-field-mode.enum';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { BigQueryDataMartSchemaType } from '../data-storage-types/bigquery/schemas/bigquery-data-mart.schema';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartListItemDto } from '../dto/domain/data-mart-list-item.dto';
import type { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import type { DataMartService } from '../services/data-mart.service';
import type { GetDataMartService } from '../use-cases/get-data-mart.service';
import type { ListDataMartsService } from '../use-cases/list-data-marts.service';
import type { QueryDataMartService } from '../use-cases/query-data-mart.service';
import type { BlendableSchemaService } from '../services/blendable-schema.service';
import type { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import type { SummarizeMcpDataCatalogService } from '../use-cases/summarize-mcp-data-catalog.service';
import { McpDataMartsFacadeImpl } from './mcp-data-marts.facade.impl';

describe('McpDataMartsFacadeImpl', () => {
  const createListDataMartsService = (items: DataMartListItemDto[]) =>
    ({
      run: jest.fn().mockResolvedValue({
        items,
        total: items.length,
        offset: 0,
      }),
    }) as unknown as jest.Mocked<ListDataMartsService>;

  const createDataMartService = (dataMart?: Partial<DataMart>) =>
    ({
      actualizeSchemaIfExpired: jest.fn().mockResolvedValue(dataMart),
    }) as unknown as jest.Mocked<DataMartService>;

  const createGetDataMartService = () =>
    ({
      run: jest.fn().mockResolvedValue({ id: 'dm_1' }),
    }) as unknown as jest.Mocked<GetDataMartService>;

  const createQueryDataMartService = () =>
    ({
      run: jest.fn(),
    }) as unknown as jest.Mocked<QueryDataMartService>;

  const createBlendableSchemaService = (
    blendedFields: unknown[] = [],
    availableSources: unknown[] = []
  ) =>
    ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields: [],
        blendedFields,
        availableSources,
      }),
    }) as unknown as jest.Mocked<BlendableSchemaService>;

  const createRelationshipService = (relationshipCount = 1) =>
    ({
      findBySourceDataMartId: jest
        .fn()
        .mockResolvedValue(Array.from({ length: relationshipCount }, () => ({}))),
    }) as unknown as jest.Mocked<DataMartRelationshipService>;

  const createSummarizeMcpDataCatalogService = () =>
    ({
      run: jest.fn().mockResolvedValue({
        projectId: 'project-1',
        dataMartCount: 0,
        topDataMartsByConnectivity: [],
      }),
    }) as unknown as jest.Mocked<SummarizeMcpDataCatalogService>;

  it('lists data marts using project-member context', async () => {
    const listDataMartsService = createListDataMartsService([
      new DataMartListItemDto(
        'dm_1',
        'Orders',
        DataMartStatus.PUBLISHED,
        DataStorageType.GOOGLE_BIGQUERY,
        'BigQuery',
        new Date('2026-06-01T10:00:00.000Z'),
        new Date('2026-06-10T10:00:00.000Z'),
        'Mock Description'
      ),
    ]);
    const dataMartService = createDataMartService();
    const getDataMartService = createGetDataMartService();
    const queryDataMartService = createQueryDataMartService();

    const facade = new McpDataMartsFacadeImpl(
      listDataMartsService,
      getDataMartService,
      dataMartService,
      queryDataMartService,
      createBlendableSchemaService(),
      createRelationshipService(),
      createSummarizeMcpDataCatalogService()
    );

    const result = await facade.listDataMarts({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });

    expect(listDataMartsService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
      })
    );
    expect(result).toEqual({
      dataMarts: [
        {
          id: 'dm_1',
          title: 'Orders',
          description: 'Mock Description',
          status: DataMartStatus.PUBLISHED,
          updatedAt: '2026-06-10T10:00:00.000Z',
        },
      ],
    });
  });

  it('returns prepared schema fields for data marts visible to the project member', async () => {
    const listDataMartsService = createListDataMartsService([
      new DataMartListItemDto(
        'dm_1',
        'Orders',
        DataMartStatus.PUBLISHED,
        DataStorageType.GOOGLE_BIGQUERY,
        'BigQuery',
        new Date('2026-06-01T10:00:00.000Z'),
        new Date('2026-06-10T10:00:00.000Z'),
        'Orders data mart'
      ),
    ]);
    const dataMartService = createDataMartService({
      id: 'dm_1',
      title: 'Orders',
      description: 'Orders data mart',
      schema: {
        type: BigQueryDataMartSchemaType,
        fields: [
          {
            name: 'order_date',
            type: BigQueryFieldType.DATE,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.CONNECTED,
            description: 'Order date',
          },
          {
            name: 'utm_source',
            type: BigQueryFieldType.STRING,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH,
            alias: 'Traffic source',
            description: 'Marketing traffic source',
          },
          {
            name: 'removed_column',
            type: BigQueryFieldType.STRING,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.DISCONNECTED,
            description: 'No longer present in storage',
          },
          {
            name: 'hidden_for_reporting',
            type: BigQueryFieldType.STRING,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.CONNECTED,
            isHiddenForReporting: true,
            description: 'Hidden from reporting',
          },
          {
            name: 'customer',
            type: BigQueryFieldType.RECORD,
            mode: BigQueryFieldMode.NULLABLE,
            status: DataMartSchemaFieldStatus.CONNECTED,
            description: 'Customer record',
            fields: [
              {
                name: 'id',
                type: BigQueryFieldType.STRING,
                mode: BigQueryFieldMode.NULLABLE,
                status: DataMartSchemaFieldStatus.CONNECTED,
                description: 'Customer id',
              },
              {
                name: 'secret',
                type: BigQueryFieldType.STRING,
                mode: BigQueryFieldMode.NULLABLE,
                status: DataMartSchemaFieldStatus.CONNECTED,
                isHiddenForReporting: true,
                description: 'Hidden customer field',
              },
              {
                name: 'removed',
                type: BigQueryFieldType.STRING,
                mode: BigQueryFieldMode.NULLABLE,
                status: DataMartSchemaFieldStatus.DISCONNECTED,
                description: 'Disconnected customer field',
              },
            ],
          },
        ],
      },
    });
    const getDataMartService = createGetDataMartService();
    const facade = new McpDataMartsFacadeImpl(
      listDataMartsService,
      getDataMartService,
      dataMartService,
      createQueryDataMartService(),
      createBlendableSchemaService(),
      createRelationshipService(),
      createSummarizeMcpDataCatalogService()
    );

    await expect(
      facade.getDataMartDetails({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
        dataMartId: 'dm_1',
      })
    ).resolves.toEqual({
      id: 'dm_1',
      name: 'Orders',
      description: 'Orders data mart',
      fields: [
        {
          name: 'order_date',
          type: BigQueryFieldType.DATE,
          mode: BigQueryFieldMode.NULLABLE,
          description: 'Order date',
        },
        {
          name: 'utm_source',
          type: BigQueryFieldType.STRING,
          mode: BigQueryFieldMode.NULLABLE,
          businessName: 'Traffic source',
          description: 'Marketing traffic source',
        },
        {
          name: 'customer',
          type: BigQueryFieldType.RECORD,
          mode: BigQueryFieldMode.NULLABLE,
          description: 'Customer record',
          fields: [
            {
              name: 'id',
              type: BigQueryFieldType.STRING,
              mode: BigQueryFieldMode.NULLABLE,
              description: 'Customer id',
            },
          ],
        },
      ],
      joinedFields: [],
    });
    expect(dataMartService.actualizeSchemaIfExpired).toHaveBeenCalledWith(
      'dm_1',
      'project-1',
      expect.any(Number)
    );
    expect(getDataMartService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dm_1',
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
      })
    );
  });

  it('does not load details when the project member cannot access the data mart', async () => {
    const listDataMartsService = createListDataMartsService([]);
    const dataMartService = createDataMartService();
    const getDataMartService = {
      run: jest.fn().mockRejectedValue(new NotFoundException('DataMart not found')),
    } as unknown as jest.Mocked<GetDataMartService>;
    const facade = new McpDataMartsFacadeImpl(
      listDataMartsService,
      getDataMartService,
      dataMartService,
      createQueryDataMartService(),
      createBlendableSchemaService(),
      createRelationshipService(),
      createSummarizeMcpDataCatalogService()
    );

    await expect(
      facade.getDataMartDetails({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
        dataMartId: 'dm_hidden',
      })
    ).rejects.toThrow(NotFoundException);
    expect(dataMartService.actualizeSchemaIfExpired).not.toHaveBeenCalled();
  });

  it('returns an empty field list when the data mart has no schema', async () => {
    const listDataMartsService = createListDataMartsService([]);
    const dataMartService = createDataMartService({
      id: 'dm_1',
      title: 'Orders',
      description: null,
      schema: undefined,
    });
    const getDataMartService = createGetDataMartService();
    const facade = new McpDataMartsFacadeImpl(
      listDataMartsService,
      getDataMartService,
      dataMartService,
      createQueryDataMartService(),
      createBlendableSchemaService(),
      createRelationshipService(),
      createSummarizeMcpDataCatalogService()
    );

    await expect(
      facade.getDataMartDetails({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
        dataMartId: 'dm_1',
      })
    ).resolves.toEqual({
      id: 'dm_1',
      name: 'Orders',
      description: '',
      fields: [],
      joinedFields: [],
    });
  });

  it('surfaces joined/blended fields with their qualified names and governance', async () => {
    const listDataMartsService = createListDataMartsService([]);
    const dataMartService = createDataMartService({
      id: 'dm_1',
      title: 'blended_events',
      description: '',
      schema: { type: BigQueryDataMartSchemaType, fields: [] },
    });
    const getDataMartService = createGetDataMartService();
    const blendableSchemaService = createBlendableSchemaService(
      [
        {
          name: 'blended_org__orgName',
          type: 'STRING',
          description: 'Organization name',
          sourceDataMartTitle: 'blended_org',
          aliasPath: 'blended_org',
          isHidden: false,
          postJoinAggregations: ['COUNT', 'COUNT_DISTINCT'],
        },
        {
          name: 'blended_users__userId',
          type: 'STRING',
          description: '',
          sourceDataMartTitle: 'blended_users',
          aliasPath: 'blended_users',
          isHidden: false,
          postJoinAggregations: ['COUNT'],
        },
        {
          // Explicit [] = "no aggregations allowed" — must be forwarded, not dropped,
          // or consumers fall back to type defaults the validator will reject.
          name: 'blended_users__lockedMetric',
          type: 'FLOAT',
          description: '',
          sourceDataMartTitle: 'blended_users',
          aliasPath: 'blended_users',
          isHidden: false,
          postJoinAggregations: [],
        },
        {
          name: 'blended_users__secret',
          type: 'STRING',
          description: '',
          sourceDataMartTitle: 'blended_users',
          aliasPath: 'blended_users',
          isHidden: true,
          postJoinAggregations: ['COUNT'],
        },
        {
          // Source the caller cannot report on → must NOT be exposed.
          name: 'blended_secret__field',
          type: 'STRING',
          description: '',
          sourceDataMartTitle: 'blended_secret',
          aliasPath: 'blended_secret',
          isHidden: false,
          postJoinAggregations: ['COUNT'],
        },
      ],
      [
        { aliasPath: 'blended_org', isIncluded: true, isAccessibleForReporting: true },
        { aliasPath: 'blended_users', isIncluded: true, isAccessibleForReporting: true },
        { aliasPath: 'blended_secret', isIncluded: true, isAccessibleForReporting: false },
      ]
    );
    const facade = new McpDataMartsFacadeImpl(
      listDataMartsService,
      getDataMartService,
      dataMartService,
      createQueryDataMartService(),
      blendableSchemaService,
      createRelationshipService(),
      createSummarizeMcpDataCatalogService()
    );

    const result = await facade.getDataMartDetails({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
    });

    // Hidden fields and fields from sources the caller cannot report on are dropped; governance
    // (allowedAggregations) is surfaced from each field's type-default set.
    expect(result.joinedFields).toEqual([
      {
        name: 'blended_org__orgName',
        type: 'STRING',
        description: 'Organization name',
        sourceDataMart: 'blended_org',
        allowedAggregations: ['COUNT', 'COUNT_DISTINCT'],
      },
      {
        name: 'blended_users__userId',
        type: 'STRING',
        description: '',
        sourceDataMart: 'blended_users',
        allowedAggregations: ['COUNT'],
      },
      {
        name: 'blended_users__lockedMetric',
        type: 'FLOAT',
        description: '',
        sourceDataMart: 'blended_users',
        allowedAggregations: [],
      },
    ]);
    expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledWith(
      'dm_1',
      'project-1',
      {
        userId: 'user-1',
        roles: ['viewer'],
      }
    );
  });

  it('exposes sliceType (raw pre-join type) only for a field whose dedup changed its type', async () => {
    const dataMartService = createDataMartService({
      id: 'dm_1',
      title: 'blended_events',
      description: '',
      schema: { type: BigQueryDataMartSchemaType, fields: [] },
    });
    const blendableSchemaService = createBlendableSchemaService(
      [
        {
          // Dedup COUNT changed STRING → INTEGER: a slice still runs on the raw STRING.
          name: 'ga__campaign_name',
          type: 'INTEGER',
          sourceFieldType: 'STRING',
          description: '',
          sourceDataMartTitle: 'Google Ads',
          aliasPath: 'ga',
          isHidden: false,
        },
        {
          // SUM keeps the type: effective === raw → no sliceType.
          name: 'ga__revenue',
          type: 'NUMERIC',
          sourceFieldType: 'NUMERIC',
          description: '',
          sourceDataMartTitle: 'Google Ads',
          aliasPath: 'ga',
          isHidden: false,
        },
      ],
      [{ aliasPath: 'ga', isIncluded: true, isAccessibleForReporting: true }]
    );
    const facade = new McpDataMartsFacadeImpl(
      createListDataMartsService([]),
      createGetDataMartService(),
      dataMartService,
      createQueryDataMartService(),
      blendableSchemaService,
      createRelationshipService(),
      createSummarizeMcpDataCatalogService()
    );

    const result = await facade.getDataMartDetails({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
    });

    const byName = new Map(result.joinedFields.map(f => [f.name, f]));
    expect(byName.get('ga__campaign_name')).toMatchObject({ type: 'INTEGER', sliceType: 'STRING' });
    expect(byName.get('ga__revenue')).not.toHaveProperty('sliceType');
  });

  it('returns no joined fields (without computing the blend) for a data mart with no relationships', async () => {
    const dataMartService = createDataMartService({
      id: 'dm_1',
      title: 'plain',
      description: '',
      schema: { type: BigQueryDataMartSchemaType, fields: [] },
    });
    const blendableSchemaService = createBlendableSchemaService();
    const facade = new McpDataMartsFacadeImpl(
      createListDataMartsService([]),
      createGetDataMartService(),
      dataMartService,
      createQueryDataMartService(),
      blendableSchemaService,
      createRelationshipService(0),
      createSummarizeMcpDataCatalogService()
    );

    const result = await facade.getDataMartDetails({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
    });

    expect(result.joinedFields).toEqual([]);
    expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
  });

  it('forwards the request and abort signal to QueryDataMartService.run', async () => {
    const response = {
      columns: ['country'],
      rows: 'country\nUA',
      truncated: false,
      totals: null,
    };
    const queryDataMartService = {
      run: jest.fn().mockResolvedValue(response),
    } as unknown as jest.Mocked<QueryDataMartService>;
    const facade = new McpDataMartsFacadeImpl(
      createListDataMartsService([]),
      createGetDataMartService(),
      createDataMartService(),
      queryDataMartService,
      createBlendableSchemaService(),
      createRelationshipService()
    );
    const request = {
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
      fields: ['country'],
      limit: 100,
    };
    const signal = new AbortController().signal;

    await expect(facade.queryDataMart(request, signal)).resolves.toBe(response);
    expect(queryDataMartService.run).toHaveBeenCalledWith(
      expect.objectContaining({ request }),
      signal
    );
  });

  it('forwards an undefined signal when none is provided to queryDataMart', async () => {
    const queryDataMartService = {
      run: jest.fn().mockResolvedValue({ columns: [], rows: '', truncated: false, totals: null }),
    } as unknown as jest.Mocked<QueryDataMartService>;
    const facade = new McpDataMartsFacadeImpl(
      createListDataMartsService([]),
      createGetDataMartService(),
      createDataMartService(),
      queryDataMartService,
      createBlendableSchemaService(),
      createRelationshipService()
    );
    const request = {
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
      fields: ['country'],
      limit: 100,
    };

    await facade.queryDataMart(request);
    expect(queryDataMartService.run).toHaveBeenCalledWith(
      expect.objectContaining({ request }),
      undefined
    );
  });

  it('degrades to no joined fields when blended-schema computation fails', async () => {
    const listDataMartsService = createListDataMartsService([]);
    const dataMartService = createDataMartService({
      id: 'dm_1',
      title: 'blended_events',
      description: '',
      schema: { type: BigQueryDataMartSchemaType, fields: [] },
    });
    const blendableSchemaService = {
      computeBlendableSchema: jest.fn().mockRejectedValue(new Error('deleted join target')),
    } as unknown as jest.Mocked<BlendableSchemaService>;
    const facade = new McpDataMartsFacadeImpl(
      listDataMartsService,
      createGetDataMartService(),
      dataMartService,
      createQueryDataMartService(),
      blendableSchemaService,
      createRelationshipService(),
      createSummarizeMcpDataCatalogService()
    );

    const result = await facade.getDataMartDetails({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
    });

    expect(result.joinedFields).toEqual([]);
  });
});
