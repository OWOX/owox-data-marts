import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  Role: { viewer: jest.fn() },
  Strategy: { PARSE: 'parse' },
}));

import { SEARCH_FACADE, SearchableEntityType } from '../../common/search/search.facade';
import { SEARCH_CONFIG } from '../search/config/search.config';
import { SearchController } from './search.controller';

describe('SearchController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SEARCH_FACADE, useValue: { search: jest.fn() } },
        {
          provide: SEARCH_CONFIG,
          useValue: { queryMinLength: 2, queryMaxLength: 512, topK: 25 },
        },
      ],
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

  it('documents the operation identity and exact search query contract', () => {
    const operation = document.paths['/api/search']?.get;

    expect(operation).toMatchObject({
      operationId: 'SearchController_search',
      summary: 'Search project entities',
      tags: ['Search'],
    });

    const parameters = Object.fromEntries(
      (operation?.parameters ?? []).map(parameter => {
        if ('$ref' in parameter) {
          throw new Error('Search query parameters must be declared inline');
        }
        return [parameter.name, parameter];
      })
    );

    expect(parameters.q).toMatchObject({
      in: 'query',
      required: true,
      schema: { type: 'string' },
    });
    expect(parameters.q.description).toContain('trimmed');
    expect(parameters.q.description).toContain('configured minimum and maximum');
    expect(parameters.limit).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 50 },
    });
    expect(parameters.limit.description).toContain('server-configured default');
    expect(parameters.entityTypes).toMatchObject({
      in: 'query',
      required: false,
      style: 'form',
      explode: false,
      schema: {
        type: 'array',
        items: {
          type: 'string',
          enum: Object.values(SearchableEntityType),
        },
      },
    });
    expect(parameters.entityTypes.description).toContain('all supported entity types');
    expect(parameters.excludeDrafts).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'boolean' },
    });
    expect(parameters.excludeDrafts.description).toContain('omitted or false');
  });

  it('documents keyword fallback when prompt embeddings are unavailable', () => {
    const description = document.paths['/api/search']?.get?.description;

    expect(description).toContain('falls back to keyword matching');
    expect(description).not.toContain('empty result set');
  });

  it('documents every required search-result field and its nullability', () => {
    const operation = document.paths['/api/search']?.get;

    expect(operation?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: { $ref: '#/components/schemas/SearchResultResponseApiDto' },
          },
        },
      },
    });
    expect(document.components?.schemas?.SearchResultResponseApiDto).toMatchObject({
      required: [
        'entityType',
        'entityId',
        'title',
        'description',
        'finalScore',
        'kwScore',
        'vecScore',
      ],
      properties: {
        entityType: {
          type: 'string',
          enum: Object.values(SearchableEntityType),
        },
        entityId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string', nullable: true },
        finalScore: { type: 'number' },
        kwScore: { type: 'number' },
        vecScore: { type: 'number', nullable: true },
      },
    });
  });
});
