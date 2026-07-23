import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

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

import { Role, Strategy } from '../../idp';
import { DataMartController } from './data-mart.controller';

describe('DataMartController list OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const dependencies = [
      ...new Set<Type<unknown>>(Reflect.getMetadata('design:paramtypes', DataMartController) ?? []),
    ];
    const moduleRef = await Test.createTestingModule({
      controllers: [DataMartController],
      providers: dependencies.map(provide => ({ provide, useValue: {} })),
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').setVersion('1.0').build()
    );
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
    ]);
    expect(itemSchema.required).not.toContain('definitionType');
    expect(itemSchema.required).not.toContain('connectorSourceName');
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
    expect(resolveRef('#/components/schemas/DataMartListItemContextApiDto')).toMatchObject({
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    });
  });
});
