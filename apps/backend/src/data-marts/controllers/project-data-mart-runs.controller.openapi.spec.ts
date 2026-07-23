import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { RunType } from '../../common/scheduler/shared/types';

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
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ListProjectDataMartRunsService } from '../use-cases/list-project-data-mart-runs.service';
import { Role, Strategy } from '../../idp';
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

  function resolvePropertyRef(property: Record<string, any>): Record<string, any> {
    return resolveRef(property.allOf[0].$ref);
  }

  it('requires viewer authentication through the shared parse-strategy primitive', () => {
    expect(Role.viewer).toHaveBeenCalledWith(Strategy.PARSE);
  });

  it('documents project run history pagination and the typed response', () => {
    const operation = document.paths['/api/data-marts/runs']?.get;

    expect(operation?.summary).toBe('Get project DataMart run history');
    expect(operation?.operationId).toBe('ProjectDataMartRunsController_list');
    expect(operation?.description).toMatch(
      /runs for Data Marts visible to the current project member/i
    );
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          required: false,
          description: expect.stringMatching(/default.*100.*floor.*cap.*100/i),
          schema: expect.objectContaining({
            type: 'number',
            default: 100,
          }),
        }),
        expect.objectContaining({
          name: 'offset',
          in: 'query',
          required: false,
          description: expect.stringMatching(/default.*0.*floor.*cap.*100,000/i),
          schema: expect.objectContaining({
            type: 'number',
            default: 0,
          }),
        }),
      ])
    );
    for (const parameter of operation?.parameters ?? []) {
      if ('in' in parameter && parameter.in === 'query') {
        expect(parameter.schema).not.toHaveProperty('minimum');
        expect(parameter.schema).not.toHaveProperty('maximum');
      }
    }
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
        'definitionRun',
        'reportId',
        'reportDefinition',
        'insightId',
        'insightDefinition',
        'insightTemplateId',
        'insightTemplateDefinition',
        'aiSourceDefinition',
        'logs',
        'errors',
        'createdAt',
        'startedAt',
        'finishedAt',
        'additionalParams',
        'totals',
        'dataMart',
        'createdByUser',
      ],
      properties: {
        definitionRun: {
          type: 'object',
          additionalProperties: true,
        },
        reportId: { type: 'string', nullable: true },
        reportDefinition: {
          type: 'object',
          nullable: true,
          additionalProperties: true,
        },
        insightId: { type: 'string', nullable: true },
        insightDefinition: {
          type: 'object',
          nullable: true,
          additionalProperties: true,
        },
        insightTemplateId: { type: 'string', nullable: true },
        insightTemplateDefinition: {
          type: 'object',
          nullable: true,
          additionalProperties: true,
        },
        aiSourceDefinition: {
          type: 'object',
          nullable: true,
          additionalProperties: true,
        },
        logs: {
          type: 'array',
          nullable: true,
          items: { type: 'string' },
        },
        errors: {
          type: 'array',
          nullable: true,
          items: { type: 'string' },
        },
        additionalParams: {
          type: 'object',
          nullable: true,
          additionalProperties: true,
        },
        totals: {
          type: 'object',
          nullable: true,
          additionalProperties: {
            oneOf: [
              { type: 'number' },
              { type: 'string' },
              { type: 'boolean' },
              { type: 'string', nullable: true, enum: [null] },
            ],
          },
        },
        dataMart: {
          allOf: [{ $ref: '#/components/schemas/ProjectDataMartRunRefResponseApiDto' }],
        },
        createdByUser: {
          nullable: true,
          allOf: [{ $ref: '#/components/schemas/ProjectDataMartRunUserResponseApiDto' }],
        },
      },
    });
    expect(runSchema.properties.definitionRun).not.toHaveProperty('nullable');
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
        email: { type: 'string', format: 'email', nullable: true },
        avatar: { type: 'string', format: 'uri', nullable: true },
      },
    });
  });

  it('documents the runtime enum sources and timestamp formats', () => {
    const runSchema = resolveRef('#/components/schemas/ProjectDataMartRunResponseApiDto');

    expect(resolvePropertyRef(runSchema.properties.status).enum).toEqual(
      Object.values(DataMartRunStatus)
    );
    expect(resolvePropertyRef(runSchema.properties.type).enum).toEqual(
      Object.values(DataMartRunType)
    );
    expect(resolvePropertyRef(runSchema.properties.runType).enum).toEqual(Object.values(RunType));
    expect(runSchema.properties).toMatchObject({
      createdAt: { type: 'string', format: 'date-time' },
      startedAt: { type: 'string', format: 'date-time', nullable: true },
      finishedAt: { type: 'string', format: 'date-time', nullable: true },
    });
  });

  it('identifies createdByUser as the nullable run author and describes every author field', () => {
    const runSchema = resolveRef('#/components/schemas/ProjectDataMartRunResponseApiDto');
    const authorSchema = resolveRef('#/components/schemas/ProjectDataMartRunUserResponseApiDto');

    expect(runSchema.properties.createdByUser).toMatchObject({
      nullable: true,
      description: expect.stringMatching(
        /run author.*null.*no creator ID.*user projection.*unavailable/i
      ),
    });
    expect(authorSchema.properties).toMatchObject({
      userId: { description: expect.stringMatching(/author.*user identifier/i) },
      fullName: { description: expect.stringMatching(/author.*full name/i) },
      email: { description: expect.stringMatching(/author.*email/i) },
      avatar: { description: expect.stringMatching(/author.*avatar/i) },
    });
  });
});
