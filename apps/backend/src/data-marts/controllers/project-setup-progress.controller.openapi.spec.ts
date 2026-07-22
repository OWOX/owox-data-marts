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

import { ProjectSetupProgressMapper } from '../mappers/project-setup-progress.mapper';
import { GetProjectSetupProgressService } from '../use-cases/get-project-setup-progress.service';
import { ProjectSetupProgressController } from './project-setup-progress.controller';

describe('ProjectSetupProgressController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [GetProjectSetupProgressService, ProjectSetupProgressMapper].map(provide => ({
      provide,
      useValue: {},
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectSetupProgressController],
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

  it('documents the project setup progress operation and response schema', () => {
    const operation = document.paths['/api/project-setup-progress']?.get;

    expect(operation).toMatchObject({
      operationId: 'ProjectSetupProgressController_getProgress',
      tags: ['project-setup-progress'],
    });
    expect(operation?.summary).toBe('Get project setup progress');
    expect(operation?.responses['200']).toMatchObject({
      description: 'The merged setup progress for the current project member.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ProjectSetupProgressResponseApiDto' },
        },
      },
    });

    const responseSchema = document.components?.schemas
      ?.ProjectSetupProgressResponseApiDto as Record<string, any>;
    expect(responseSchema).toMatchObject({
      required: ['version', 'stepsSchemaVersion', 'progress', 'steps'],
      properties: {
        version: { type: 'integer', minimum: 1 },
        stepsSchemaVersion: { type: 'integer', minimum: 1 },
        progress: { type: 'integer', minimum: 0, maximum: 100 },
        steps: {
          description: 'Per-step state (project-scoped + user-scoped, merged)',
          allOf: [{ $ref: '#/components/schemas/ProjectSetupStepsApiDto' }],
        },
      },
    });

    const stepsSchema = resolveRef(responseSchema.properties.steps.allOf[0].$ref);
    expect(stepsSchema.required).toEqual([
      'hasStorage',
      'hasDraftDataMart',
      'hasPublishedDataMart',
      'hasDestination',
      'hasReport',
      'hasReportRun',
      'hasTeammatesInvited',
      'hasGoogleSheetsDestination',
      'hasGoogleSheetsExtension',
      'hasGoogleSheetsReportRun',
    ]);
    expect(Object.values(stepsSchema.properties)).toEqual(
      Array(10).fill({ $ref: '#/components/schemas/ProjectSetupStepStateApiDto' })
    );

    expect(resolveRef('#/components/schemas/ProjectSetupStepStateApiDto')).toMatchObject({
      required: ['done', 'completedAt'],
      properties: {
        done: { type: 'boolean' },
        completedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
        },
      },
    });
  });
});
