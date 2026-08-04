import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RejectPluginAuth: () => () => undefined,
  Role: { admin: jest.fn(), viewer: jest.fn() },
  Strategy: { INTROSPECT: 'introspect', PARSE: 'parse' },
}));

import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { ListPublicationsService } from '../use-cases/list-publications.service';
import { PublishPluginService } from '../use-cases/publish-plugin.service';
import { UnpublishPluginService } from '../use-cases/unpublish-plugin.service';
import { PluginPublicationsController } from './plugin-publications.controller';

describe('PluginPublicationsController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [
      ...[PublishPluginService, UnpublishPluginService, ListPublicationsService].map(provide => ({
        provide,
        useValue: {},
      })),
      PluginPresentationMapper,
    ];

    const moduleRef = await Test.createTestingModule({
      controllers: [PluginPublicationsController],
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

  const resolveRef = (ref: string): Record<string, any> =>
    document.components?.schemas?.[ref.split('/').at(-1)!] as Record<string, any>;

  it('documents publishing, including both deployment audience forms', () => {
    const operation = document.paths['/api/plugins/publications']?.post;

    expect(operation?.summary).toBe('Publish a plugin to the Gallery at one authority level');

    const requestBody = operation?.requestBody as Record<string, any>;
    const schema = resolveRef(requestBody.content['application/json'].schema.$ref);

    expect(schema).toMatchObject({
      required: ['repository', 'scope'],
      properties: {
        scope: { enum: ['deployment', 'project', 'member'] },
        projectIds: { type: 'array', items: { type: 'string' } },
        allProjects: { type: 'boolean' },
      },
    });
  });

  // Unpublish carries a body, which DELETE handles poorly across clients and proxies.
  it('exposes unpublish as a POST that answers 200 rather than 201', () => {
    const paths = document.paths['/api/plugins/publications/unpublish'];

    expect(paths?.post).toBeDefined();
    expect(paths?.delete).toBeUndefined();
    expect(paths?.post?.responses['200']).toBeDefined();
    expect(paths?.post?.responses['201']).toBeUndefined();
  });

  it('documents the scope query on the list operation', () => {
    const operation = document.paths['/api/plugins/publications']?.get;

    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'scope',
          in: 'query',
          schema: expect.objectContaining({ enum: ['deployment', 'project', 'member'] }),
        }),
      ])
    );
  });

  it('never documents a project id on the response, so callers cannot mistake it for an input', () => {
    const schema = resolveRef('#/components/schemas/PublicationResponseApiDto');

    expect(Object.keys(schema.properties)).toEqual([
      'publicationId',
      'pluginId',
      // The repository is the caller's own publishing input echoed back, not a project
      // id: it is what unpublish addresses, and only its manager ever receives it.
      'repository',
      'scope',
      'isActive',
      'allProjects',
      'audienceProjectIds',
      'currentSemver',
      // Publisher-only source diagnostics (rejections, delivery URL, commit).
      'diagnostics',
    ]);
    expect(Object.keys(schema.properties)).not.toContain('projectId');
  });
});
