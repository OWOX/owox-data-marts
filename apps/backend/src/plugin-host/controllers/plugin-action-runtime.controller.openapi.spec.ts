import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RequirePluginAuth: () => () => undefined,
  Role: { viewer: jest.fn() },
  Strategy: { PARSE: 'parse' },
}));

import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { CancelPluginActionExecutionService } from '../use-cases/cancel-plugin-action-execution.service';
import { GetCurrentPluginActionExecutionService } from '../use-cases/get-current-plugin-action-execution.service';
import { GetPluginActionExecutionService } from '../use-cases/get-plugin-action-execution.service';
import { StartPluginActionExecutionService } from '../use-cases/start-plugin-action-execution.service';
import { PluginActionRuntimeController } from './plugin-action-runtime.controller';

describe('PluginActionRuntimeController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PluginActionRuntimeController],
      providers: [
        StartPluginActionExecutionService,
        GetPluginActionExecutionService,
        CancelPluginActionExecutionService,
        GetCurrentPluginActionExecutionService,
        PluginPresentationMapper,
      ].map(provide => ({ provide, useValue: {} })),
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

  it('documents the start body, read raw by the route', () => {
    const operation = document.paths['/api/plugins/runtime/actions/{action}/executions']?.post;

    expect(operation?.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/StartPluginActionExecutionApiDto' },
        },
      },
    });
    expect(document.components?.schemas?.StartPluginActionExecutionApiDto).toMatchObject({
      properties: { input: expect.any(Object) },
    });
  });

  it('documents waitSeconds as an optional whole number that is clamped to the cap', () => {
    const operation = document.paths['/api/plugins/runtime/executions/{id}']?.get;

    expect(operation?.parameters).toContainEqual(
      expect.objectContaining({
        name: 'waitSeconds',
        in: 'query',
        required: false,
        description: expect.stringContaining('Above 20, 20 is used'),
        schema: expect.objectContaining({ type: 'integer', minimum: 0, default: 0 }),
      })
    );
  });
});
