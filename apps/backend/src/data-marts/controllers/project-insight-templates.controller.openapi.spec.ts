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

jest.mock('../mappers/insight-template.mapper', () => ({
  InsightTemplateMapper: jest.fn(),
}));

jest.mock('../use-cases/list-project-insight-templates.service', () => ({
  ListProjectInsightTemplatesService: jest.fn(),
}));

import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { ListProjectInsightTemplatesService } from '../use-cases/list-project-insight-templates.service';
import { ProjectInsightTemplatesController } from './project-insight-templates.controller';

describe('ProjectInsightTemplatesController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [ListProjectInsightTemplatesService, InsightTemplateMapper].map(provide => ({
      provide,
      useValue: {},
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectInsightTemplatesController],
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

  it('documents project insight-template pagination and the typed response', () => {
    const operation = document.paths['/api/data-marts/insight-templates']?.get;

    expect(operation?.summary).toBe(
      'List insight templates across accessible Data Marts in the project'
    );
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
          schema: { $ref: '#/components/schemas/ProjectInsightTemplatesResponseApiDto' },
        },
      },
    });

    const responseSchema = resolveRef('#/components/schemas/ProjectInsightTemplatesResponseApiDto');
    expect(responseSchema).toMatchObject({
      required: ['insights'],
      properties: {
        insights: {
          type: 'array',
          items: { $ref: '#/components/schemas/ProjectInsightTemplateResponseApiDto' },
        },
      },
    });

    const insightSchema = resolveRef('#/components/schemas/ProjectInsightTemplateResponseApiDto');
    expect(insightSchema).toMatchObject({
      required: expect.arrayContaining([
        'id',
        'title',
        'sourcesCount',
        'lastRenderedTemplateUpdatedAt',
        'createdById',
        'createdAt',
        'modifiedAt',
        'dataMart',
        'canDelete',
      ]),
      properties: {
        dataMart: {
          $ref: '#/components/schemas/ProjectInsightTemplateDataMartRefResponseApiDto',
        },
        canDelete: { type: 'boolean' },
      },
    });
    expect(
      resolveRef('#/components/schemas/ProjectInsightTemplateDataMartRefResponseApiDto')
    ).toMatchObject({
      required: ['id', 'title'],
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
      },
    });
  });
});
