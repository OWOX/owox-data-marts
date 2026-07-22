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

jest.mock('../use-cases/get-model-canvas-data-marts.service', () => ({
  GetModelCanvasDataMartsService: jest.fn(),
}));

jest.mock('../use-cases/get-model-canvas-edges.service', () => ({
  GetModelCanvasEdgesService: jest.fn(),
}));

import { ModelCanvasMapper } from '../mappers/model-canvas.mapper';
import { GetModelCanvasDataMartsService } from '../use-cases/get-model-canvas-data-marts.service';
import { GetModelCanvasEdgesService } from '../use-cases/get-model-canvas-edges.service';
import { ModelCanvasController } from './model-canvas.controller';

describe('ModelCanvasController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [
      GetModelCanvasDataMartsService,
      GetModelCanvasEdgesService,
      ModelCanvasMapper,
    ].map(provide => ({ provide, useValue: {} }));

    const moduleRef = await Test.createTestingModule({
      controllers: [ModelCanvasController],
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

  it('documents the paginated data marts path, query, and response', () => {
    const operation = document.paths['/api/model-canvas/data-marts']?.get;

    expect(operation).toMatchObject({
      operationId: 'ModelCanvasController_getDataMarts',
      tags: ['Model Canvas'],
    });
    expect(operation?.summary).toBe(
      'Get a page of data marts of a storage for the project data model canvas'
    );
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'storageId',
          in: 'query',
          required: true,
        }),
        expect.objectContaining({
          name: 'offset',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ default: 0, minimum: 0 }),
        }),
      ])
    );
    expect(operation?.responses['200']).toMatchObject({
      description: 'Data marts are access-filtered like the data mart list',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ModelCanvasDataMartsResponseApiDto' },
        },
      },
    });
  });

  it('documents the edges path, required storage query, and response', () => {
    const operation = document.paths['/api/model-canvas/edges']?.get;

    expect(operation).toMatchObject({
      operationId: 'ModelCanvasController_getEdges',
      tags: ['Model Canvas'],
    });
    expect(operation?.summary).toBe(
      'Get the relationships between visible data marts of a storage for the model canvas'
    );
    expect(operation?.parameters).toEqual([
      expect.objectContaining({
        name: 'storageId',
        in: 'query',
        required: true,
      }),
    ]);
    expect(operation?.responses['200']).toMatchObject({
      description: 'Edges reference only data marts visible to the current user',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ModelCanvasEdgesResponseApiDto' },
        },
      },
    });
  });
});
