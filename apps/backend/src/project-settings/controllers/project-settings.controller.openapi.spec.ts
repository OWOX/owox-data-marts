import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  Role: {
    admin: jest.fn(),
    viewer: jest.fn(),
  },
  Strategy: {
    INTROSPECT: 'introspect',
    PARSE: 'parse',
  },
}));

import { ProjectSettingsMapper } from '../mappers/project-settings.mapper';
import { GetProjectSettingsService } from '../use-cases/get-project-settings.service';
import { UpdateProjectDescriptionService } from '../use-cases/update-project-description.service';
import { ProjectSettingsController } from './project-settings.controller';

describe('ProjectSettingsController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [
      GetProjectSettingsService,
      UpdateProjectDescriptionService,
      ProjectSettingsMapper,
    ].map(provide => ({ provide, useValue: {} }));

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectSettingsController],
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

  it('documents the get project settings operation and response', () => {
    const operation = document.paths['/api/projects/settings']?.get;

    expect(operation).toMatchObject({
      operationId: 'ProjectSettingsController_getSettings',
      tags: ['ProjectSettings'],
    });
    expect(operation?.summary).toBe('Get project settings');
    expect(operation?.responses['200']).toMatchObject({
      description: 'The current project settings.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ProjectSettingsResponseApiDto' },
        },
      },
    });

    expect(resolveRef('#/components/schemas/ProjectSettingsResponseApiDto')).toMatchObject({
      required: ['description'],
      properties: {
        description: { type: 'string', nullable: true },
      },
    });
  });

  it('documents the update project description request and response', () => {
    const operation = document.paths['/api/projects/settings/description']?.put;

    expect(operation).toMatchObject({
      operationId: 'ProjectSettingsController_updateDescription',
      tags: ['ProjectSettings'],
    });
    expect(operation?.summary).toBe('Update the project description');
    expect(operation?.responses['200']).toMatchObject({
      description: 'The updated project settings.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ProjectSettingsResponseApiDto' },
        },
      },
    });

    const requestBody = operation?.requestBody as Record<string, any>;
    const requestSchema = requestBody.content['application/json'].schema as Record<string, any>;
    expect(resolveRef(requestSchema.$ref)).toMatchObject({
      required: ['description'],
      properties: {
        description: {
          type: 'string',
          nullable: true,
          minLength: 1,
          maxLength: 10_000,
        },
      },
    });
  });
});
