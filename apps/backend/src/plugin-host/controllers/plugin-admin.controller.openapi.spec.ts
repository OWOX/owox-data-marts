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
import { ResumePluginService } from '../use-cases/resume-plugin.service';
import { SuspendPluginService } from '../use-cases/suspend-plugin.service';
import { PluginAdminController } from './plugin-admin.controller';

describe('PluginAdminController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PluginAdminController],
      providers: [
        { provide: SuspendPluginService, useValue: {} },
        { provide: ResumePluginService, useValue: {} },
        PluginPresentationMapper,
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

  const resolveRef = (ref: string): Record<string, any> =>
    document.components?.schemas?.[ref.split('/').at(-1)!] as Record<string, any>;

  it.each(['suspend', 'resume'])('exposes %s as a POST answering 200', action => {
    const path = document.paths[`/api/plugins/${action}`];

    expect(path?.post?.responses['200']).toBeDefined();
    expect(path?.post?.responses['201']).toBeUndefined();
    expect(path?.delete).toBeUndefined();
  });

  it('takes only a repository and an optional note', () => {
    const requestBody = document.paths['/api/plugins/suspend']?.post?.requestBody as Record<
      string,
      any
    >;
    const schema = resolveRef(requestBody.content['application/json'].schema.$ref);

    expect(schema.required).toEqual(['repository']);
    expect(Object.keys(schema.properties)).toEqual(['repository', 'note']);
  });

  // What suspension does and does not affect is the part operators get wrong, so it is
  // written into the contract rather than left to tribal knowledge.
  it('states in the contract that installations and publications survive', () => {
    const description = document.paths['/api/plugins/suspend']?.post?.description ?? '';

    expect(description).toContain('Uninstalling and updating stay available');
    expect(description).toContain('publications and installations are untouched');
  });

  it('states that resume re-enables on the version current at that moment', () => {
    const description = document.paths['/api/plugins/resume']?.post?.description ?? '';

    expect(description).toContain('may have moved on during the suspension');
  });
});
