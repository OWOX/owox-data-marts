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

  it('keeps the operation identity used by the Support Matrix', () => {
    const operation = document.paths['/api/auth/context']?.get;

    expect(operation?.operationId).toBe('AuthContextController_getContext');
  });

  it('wires the response to the named auth-context presentation component', () => {
    const operation = document.paths['/api/auth/context']?.get;
    const response = operation?.responses['200'];

    expect(
      response && 'content' in response ? response.content?.['application/json']?.schema : null
    ).toEqual({
      $ref: '#/components/schemas/AuthContextResponseApiDto',
    });
    expect(document.components?.schemas?.AuthContextResponseApiDto).toBeDefined();
  });
});
