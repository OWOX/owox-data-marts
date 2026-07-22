import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  Role: {
    viewer: jest.fn(),
  },
  Strategy: {
    PARSE: 'parse',
  },
}));

jest.mock('../mappers/data-mart.mapper', () => ({
  DataMartMapper: jest.fn(),
}));

jest.mock('../use-cases/list-project-data-mart-runs.service', () => ({
  ListProjectDataMartRunsService: jest.fn(),
}));

import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ListProjectDataMartRunsService } from '../use-cases/list-project-data-mart-runs.service';
import { ProjectDataMartRunsController } from './project-data-mart-runs.controller';

describe('ProjectDataMartRunsController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [ListProjectDataMartRunsService, DataMartMapper].map(provide => ({
      provide,
      useValue: {},
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectDataMartRunsController],
      providers,
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

  it('documents project run history pagination and the typed response', () => {
    const operation = document.paths['/api/data-marts/runs']?.get;

    expect(operation).toMatchObject({
      operationId: 'ProjectDataMartRunsController_list',
      tags: ['Run History'],
    });
    expect(operation?.summary).toBe('Get project DataMart run history');
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ type: 'number' }),
        }),
        expect.objectContaining({
          name: 'offset',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ type: 'number' }),
        }),
      ])
    );
    expect(operation?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ProjectDataMartRunsResponseApiDto' },
        },
      },
    });

    const responseSchema = resolveRef('#/components/schemas/ProjectDataMartRunsResponseApiDto');
    expect(responseSchema).toMatchObject({
      required: ['runs'],
      properties: {
        runs: {
          type: 'array',
          items: { $ref: '#/components/schemas/ProjectDataMartRunResponseApiDto' },
        },
      },
    });

    const runSchema = resolveRef('#/components/schemas/ProjectDataMartRunResponseApiDto');
    expect(runSchema).toMatchObject({
      required: [
        'id',
        'status',
        'type',
        'runType',
        'dataMartId',
        'createdAt',
        'dataMart',
        'createdByUser',
      ],
      properties: {
        dataMart: { $ref: '#/components/schemas/ProjectDataMartRunRefResponseApiDto' },
        createdByUser: {
          nullable: true,
          allOf: [{ $ref: '#/components/schemas/ProjectDataMartRunUserResponseApiDto' }],
        },
      },
    });
    expect(resolveRef('#/components/schemas/ProjectDataMartRunRefResponseApiDto')).toMatchObject({
      required: ['id', 'title'],
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
      },
    });
    expect(resolveRef('#/components/schemas/ProjectDataMartRunUserResponseApiDto')).toMatchObject({
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
        fullName: { type: 'string', nullable: true },
        email: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
      },
    });
  });
});
