import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

jest.mock('../decorators', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
}));

import { AuthContextController } from './auth-context.controller';

describe('AuthContextController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthContextController],
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

  it('documents the auth context operation, headers, and response schema', () => {
    const operation = document.paths['/api/auth/context']?.get;

    expect(operation).toMatchObject({
      operationId: 'AuthContextController_getContext',
      tags: ['Authentication'],
      summary: 'Get the current auth context',
    });
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'X-OWOX-Authorization',
          in: 'header',
          required: true,
        }),
        expect.objectContaining({
          name: 'X-OWOX-Api-Key-Id',
          in: 'header',
          required: false,
        }),
      ])
    );
    expect(operation?.responses['200']).toMatchObject({
      description: 'Auth context resolved by the backend auth guard.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['userId', 'projectId'],
            properties: {
              userId: { type: 'string' },
              projectId: { type: 'string' },
              email: { type: 'string', nullable: true },
              fullName: { type: 'string', nullable: true },
              avatar: { type: 'string', nullable: true },
              roles: {
                type: 'array',
                items: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
              },
              projectTitle: { type: 'string', nullable: true },
              authFlow: { type: 'string', nullable: true },
              apiKeyId: { type: 'string', nullable: true },
            },
          },
        },
      },
    });
  });
});
