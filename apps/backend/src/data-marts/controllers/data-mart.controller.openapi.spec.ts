import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OpenAPIObject } from '@nestjs/swagger';

jest.mock('@owox/connectors', () => ({
  AvailableConnectors: {},
  Connectors: {},
  Core: {},
}));

jest.mock('snowflake-sdk', () => ({}));

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  ViewOnlySafe: () => () => undefined,
  Role: {
    admin: jest.fn(),
    editor: jest.fn(),
    viewer: jest.fn(),
  },
  Strategy: {
    INTROSPECT: 'introspect',
    PARSE: 'parse',
  },
}));

jest.mock('../mappers/data-mart.mapper', () => ({
  DataMartMapper: jest.fn(),
}));

jest.mock('../use-cases/batch-data-mart-health-status.service', () => ({
  BatchDataMartHealthStatusService: jest.fn(),
}));

import { Role, Strategy, type AuthorizationContext } from '../../idp';
import { DataMartController } from './data-mart.controller';
import { createSwaggerDocument } from '../../config/swagger.config';

describe('DataMartController list OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  let controller: DataMartController;
  const mapper = {
    toGetDataMartRunsCommand: jest.fn(),
    toRunsResponse: jest.fn().mockReturnValue({ runs: [] }),
  };
  const getDataMartRunsService = { run: jest.fn().mockResolvedValue([]) };

  beforeAll(async () => {
    const dependencies = [
      ...new Set<Type<unknown>>(Reflect.getMetadata('design:paramtypes', DataMartController) ?? []),
    ];
    const moduleRef = await Test.createTestingModule({
      controllers: [DataMartController],
      providers: dependencies.map(provide => ({ provide, useValue: {} })),
    }).compile();

    controller = moduleRef.get(DataMartController);
    Object.assign(controller, { mapper, getDataMartRunsService });

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    document = createSwaggerDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  function resolveRef(ref: string): Record<string, any> {
    const schemaName = ref.split('/').at(-1)!;
    return document.components?.schemas?.[schemaName] as Record<string, any>;
  }

  it('publishes the stable operation identity and validated list filters', () => {
    const operation = document.paths['/api/data-marts']?.get;

    expect(Role.viewer).toHaveBeenCalledWith(Strategy.PARSE);
    expect(operation).toMatchObject({
      operationId: 'DataMartController_list',
      summary: 'List visible Data Marts',
      tags: ['DataMarts'],
    });
    expect(operation?.description).toMatch(/viewer access/i);
    expect(operation?.description).toMatch(/visible/i);
    expect(operation?.description).toContain('1000');

    const parameters = Object.fromEntries(
      (operation?.parameters ?? []).map(parameter => {
        if ('$ref' in parameter) {
          throw new Error('Data Mart list query parameters must be declared inline');
        }
        return [parameter.name, parameter];
      })
    );
    expect(parameters.offset).toMatchObject({
      in: 'query',
      required: false,
      schema: {
        type: 'integer',
        default: 0,
        minimum: 0,
      },
    });
    expect(parameters.ownerFilter).toMatchObject({
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['has_owners', 'no_owners'],
      },
    });
    expect(parameters.ownerFilter.description).toMatch(/business or technical owners/i);
  });

  it('publishes the paginated response through named component schemas', () => {
    const operation = document.paths['/api/data-marts']?.get;

    expect(operation?.responses['200']).toMatchObject({
      description: expect.stringMatching(/visible Data Marts/i),
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/PaginatedDataMartsResponseApiDto' },
        },
      },
    });

    const pageSchema = resolveRef('#/components/schemas/PaginatedDataMartsResponseApiDto');
    expect(pageSchema).toMatchObject({
      required: ['items', 'total', 'nextOffset'],
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/DataMartListItemResponseApiDto' },
        },
        total: { type: 'integer', minimum: 0 },
        nextOffset: { type: 'integer', minimum: 0, nullable: true },
      },
    });

    const itemSchema = resolveRef('#/components/schemas/DataMartListItemResponseApiDto');
    expect(itemSchema.required).toEqual([
      'id',
      'title',
      'status',
      'storage',
      'description',
      'triggersCount',
      'reportsCount',
      'createdByUser',
      'businessOwnerUsers',
      'technicalOwnerUsers',
      'createdAt',
      'modifiedAt',
      'contexts',
      'availableForReporting',
      'availableForMaintenance',
      'dataLastUpdated',
    ]);
    expect(itemSchema.required).not.toContain('definitionType');
    expect(itemSchema.required).not.toContain('connectorSourceName');
    expect(itemSchema.properties).not.toHaveProperty('qualitySummary');
    expect(itemSchema.properties).toMatchObject({
      status: {
        type: 'string',
        enum: ['DRAFT', 'PUBLISHED'],
      },
      storage: {
        $ref: '#/components/schemas/DataMartListItemStorageApiDto',
      },
      description: { type: 'string', nullable: true },
      definitionType: {
        type: 'string',
        enum: ['SQL', 'TABLE', 'VIEW', 'TABLE_PATTERN', 'CONNECTOR'],
        nullable: true,
      },
      connectorSourceName: { type: 'string' },
      triggersCount: { type: 'integer', minimum: 0 },
      reportsCount: { type: 'integer', minimum: 0 },
      createdByUser: {
        nullable: true,
        allOf: [{ $ref: '#/components/schemas/UserProjectionDto' }],
      },
      createdAt: { type: 'string', format: 'date-time' },
      modifiedAt: { type: 'string', format: 'date-time' },
      contexts: {
        type: 'array',
        items: { $ref: '#/components/schemas/DataMartListItemContextApiDto' },
      },
      availableForReporting: { type: 'boolean' },
      availableForMaintenance: { type: 'boolean' },
    });

    expect(resolveRef('#/components/schemas/DataMartListItemStorageApiDto')).toMatchObject({
      required: ['type', 'title'],
      properties: {
        type: {
          type: 'string',
          enum: [
            'GOOGLE_BIGQUERY',
            'AWS_ATHENA',
            'SNOWFLAKE',
            'AWS_REDSHIFT',
            'DATABRICKS',
            'LEGACY_GOOGLE_BIGQUERY',
          ],
        },
        title: { type: 'string' },
      },
    });
    const userSchema = resolveRef('#/components/schemas/UserProjectionDto');
    expect(userSchema).toMatchObject({
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
        fullName: { type: 'string', nullable: true },
        email: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
      },
    });
    expect(userSchema.properties.email).not.toHaveProperty('format');
    expect(userSchema.properties.avatar).not.toHaveProperty('format');
    expect(resolveRef('#/components/schemas/DataMartListItemContextApiDto')).toMatchObject({
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    });
  });

  it('preserves the shared run-history item contract and keeps DQ detail separate', () => {
    const listOperation = document.paths['/api/data-marts/{id}/runs']?.get;
    expect(listOperation?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/DataMartRunsResponseApiDto' },
        },
      },
    });

    const listSchema = resolveRef('#/components/schemas/DataMartRunsResponseApiDto');
    expect(listSchema.properties.runs).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/DataMartRunResponseApiDto' },
    });

    const runSchema = resolveRef('#/components/schemas/DataMartRunResponseApiDto');
    expect(runSchema.required).toContain('createdByUser');
    expect(runSchema.properties.status).not.toHaveProperty('nullable');
    expect(runSchema.properties.type).not.toHaveProperty('nullable');
    expect(runSchema.properties.runType).not.toHaveProperty('nullable');
    expect(runSchema.properties).toMatchObject({
      status: {
        allOf: [{ $ref: '#/components/schemas/DataMartRunStatus' }],
      },
      type: {
        allOf: [{ $ref: '#/components/schemas/DataMartRunType' }],
      },
      runType: {
        allOf: [{ $ref: '#/components/schemas/RunType' }],
      },
      createdByUser: {
        nullable: true,
        allOf: [{ $ref: '#/components/schemas/UserProjectionDto' }],
      },
      qualitySummary: {
        nullable: true,
        allOf: [{ $ref: '#/components/schemas/CompactDataQualitySummaryApiDto' }],
      },
    });
    expect(runSchema.properties).not.toHaveProperty('dataQuality');
    expect(resolveRef('#/components/schemas/DataMartRunStatus').enum).toEqual(
      expect.arrayContaining(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'])
    );
    expect(resolveRef('#/components/schemas/DataMartRunType').enum).toEqual(
      expect.arrayContaining(['CONNECTOR', 'DATA_QUALITY'])
    );
    expect(resolveRef('#/components/schemas/RunType').enum).toEqual(
      expect.arrayContaining(['manual', 'scheduled'])
    );

    const detailOperation = document.paths['/api/data-marts/{id}/runs/{runId}']?.get;
    expect(detailOperation?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/DataMartRunDetailResponseApiDto' },
        },
      },
    });
    expect(
      resolveRef('#/components/schemas/DataMartRunDetailResponseApiDto').properties
    ).toHaveProperty('dataQuality');
  });

  it('publishes the complete Data Mart run lifecycle with stable operation identities', () => {
    const manualRun = document.paths['/api/data-marts/{id}/manual-run']?.post;
    const listRuns = document.paths['/api/data-marts/{id}/runs']?.get;
    const getRun = document.paths['/api/data-marts/{id}/runs/{runId}']?.get;
    const cancelRun = document.paths['/api/data-marts/{id}/runs/{runId}/cancel']?.post;

    expect(manualRun).toMatchObject({
      operationId: 'DataMartController_manualRun',
      summary: 'Start a manual Data Mart run',
      tags: ['DataMarts'],
    });
    expect(manualRun?.description).toMatch(/technical user/i);
    expect(manualRun?.requestBody).toMatchObject({
      required: false,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RunDataMartRequestApiDto' },
        },
      },
    });
    const requestSchema = resolveRef('#/components/schemas/RunDataMartRequestApiDto');
    expect(requestSchema.properties.payload).toMatchObject({
      oneOf: [
        { $ref: '#/components/schemas/IncrementalRunDataMartPayloadApiDto' },
        { $ref: '#/components/schemas/ManualBackfillRunDataMartPayloadApiDto' },
      ],
    });
    expect(resolveRef('#/components/schemas/IncrementalRunDataMartPayloadApiDto')).toMatchObject({
      additionalProperties: false,
      properties: {
        runType: { type: 'string', enum: ['INCREMENTAL'] },
        data: { type: 'object', additionalProperties: true },
      },
    });
    expect(resolveRef('#/components/schemas/ManualBackfillRunDataMartPayloadApiDto')).toMatchObject(
      {
        additionalProperties: false,
        required: ['runType'],
        properties: {
          runType: { type: 'string', enum: ['MANUAL_BACKFILL'] },
          data: { type: 'object', additionalProperties: true },
        },
      }
    );
    expect(manualRun?.responses['201']).toMatchObject({
      description: expect.stringMatching(/created/i),
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RunDataMartResponseApiDto' },
        },
      },
    });
    expect(manualRun?.responses['413']).toEqual({ description: 'Request body too large' });
    expect(resolveRef('#/components/schemas/RunDataMartResponseApiDto')).toMatchObject({
      required: ['runId'],
      properties: { runId: { type: 'string', format: 'uuid' } },
    });

    expect(listRuns).toMatchObject({
      operationId: 'DataMartController_getRunHistory',
      summary: 'List Data Mart runs',
      tags: ['DataMarts'],
    });
    expect(listRuns?.description).toMatch(/business user/i);
    const listParameters = Object.fromEntries(
      (listRuns?.parameters ?? []).map(parameter => {
        if ('$ref' in parameter) {
          throw new Error('Data Mart run list parameters must be declared inline');
        }
        return [parameter.name, parameter];
      })
    );
    expect(listParameters.limit).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'number', default: 100 },
    });
    expect(listParameters.limit.schema).not.toHaveProperty('minimum');
    expect(listParameters.limit.schema).not.toHaveProperty('maximum');
    expect(listParameters.offset).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'number', default: 0 },
    });
    expect(listParameters.offset.schema).not.toHaveProperty('minimum');
    expect(listParameters.offset.schema).not.toHaveProperty('maximum');

    expect(getRun).toMatchObject({
      operationId: 'DataMartController_getRunById',
      summary: 'Get a Data Mart run',
      tags: ['DataMarts'],
    });
    expect(getRun?.description).toMatch(/business user/i);

    expect(cancelRun).toMatchObject({
      operationId: 'DataMartController_cancelRun',
      summary: 'Cancel a Data Mart run',
      tags: ['DataMarts'],
    });
    expect(cancelRun?.description).toMatch(/technical user/i);
    expect(cancelRun?.responses['204']).toEqual({ description: 'Data Mart run cancelled' });
  });

  it('preserves caller-provided scoped run-history pagination values', async () => {
    const context = {
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    } as AuthorizationContext;
    mapper.toGetDataMartRunsCommand.mockReturnValue({ kind: 'list-runs' });

    await controller.getRunHistory(context, 'dm-1', 500, 100_001);

    expect(mapper.toGetDataMartRunsCommand).toHaveBeenCalledWith('dm-1', context, 500, 100_001);
  });

  it('marks mapper-owned nullable Data Quality fields as present in every run response', () => {
    const runSchema = resolveRef('#/components/schemas/DataMartRunResponseApiDto');
    const detailSchema = resolveRef('#/components/schemas/DataMartRunDetailResponseApiDto');

    expect(runSchema.required).toContain('qualitySummary');
    expect(runSchema.required).toContain('totals');
    expect(runSchema.properties.qualitySummary).toMatchObject({ nullable: true });
    expect(detailSchema.required).toContain('dataQuality');
    expect(detailSchema.properties.dataQuality).toMatchObject({ nullable: true });
  });
});
