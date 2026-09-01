import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  Role: { admin: jest.fn(), viewer: jest.fn() },
  Strategy: { INTROSPECT: 'introspect', PARSE: 'parse' },
}));

import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { GetPluginDetailsService } from '../use-cases/get-plugin-details.service';
import { GetPluginGalleryService } from '../use-cases/get-plugin-gallery.service';
import { PluginGalleryController } from './plugin-gallery.controller';

describe('PluginGalleryController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [
      ...[GetPluginGalleryService, GetPluginDetailsService].map(provide => ({
        provide,
        useValue: {},
      })),
      PluginPresentationMapper,
    ];

    const moduleRef = await Test.createTestingModule({
      controllers: [PluginGalleryController],
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

  it('documents the combined gallery as a list', () => {
    const operation = document.paths['/api/plugins/gallery']?.get;

    expect(operation?.summary).toBe('Plugins visible to the current member in the current project');
    expect(operation?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: { $ref: '#/components/schemas/PluginGalleryEntryApiDto' },
          },
        },
      },
    });
  });

  // The response the web binds to is the boundary that keeps source diagnostics away
  // from members. Pinning the exact key list makes any future addition deliberate.
  it('exposes exactly the member-facing fields and nothing else', () => {
    const schema = resolveRef('#/components/schemas/PluginGalleryEntryApiDto');

    expect(Object.keys(schema.properties)).toEqual([
      'pluginId',
      'displayName',
      'description',
      'currentSemver',
      'currentVersionId',
      'visibleViaScopes',
      'suspended',
      'installationState',
      'source',
      // A date, not a source diagnostic: it says when this deployment first saw the
      // plugin, which is what "newest" in the Gallery orders by.
      'addedAt',
      // Also a date, and also not a diagnostic: when maintenance next looks for a newer
      // version. Members are told this so that asking for a check reads as accelerating
      // something already scheduled.
      'nextCheckAt',
      'credentialRequirements',
    ]);
  });

  it('marks the repository url optional, because a private repository has none disclosed', () => {
    const source = resolveRef('#/components/schemas/PluginSourceApiDto');

    expect(source.required).toEqual(['ownerName', 'ownerUrl']);
    expect(source.properties).toHaveProperty('repositoryUrl');
  });

  it('documents the direct plugin route', () => {
    const operation = document.paths['/api/plugins/{pluginId}']?.get;

    expect(operation?.summary).toBe('One plugin, by id');
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'pluginId', in: 'path' })])
    );
  });
});
