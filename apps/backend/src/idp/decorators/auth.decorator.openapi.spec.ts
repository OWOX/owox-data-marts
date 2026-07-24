import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiHeader, OpenAPIObject } from '@nestjs/swagger';
import { createSwaggerDocument } from '../../config/swagger.config';
import { ApiKeyExchangeController } from '../../project-member-api-keys/controllers/api-key-exchange.controller';
import { ExchangeProjectMemberApiKeyService } from '../../project-member-api-keys/use-cases/exchange-project-member-api-key.service';
import { IdpGuard } from '../guards/idp.guard';
import { Role } from '../types';
import { Auth } from './auth.decorator';
import { RejectApiKeyAuth } from './reject-api-key-auth.decorator';

@Controller('eligible')
class EligibleController {
  @Get()
  @Auth(Role.viewer())
  get(): void {}
}

@Controller('api-key-rejected')
@RejectApiKeyAuth()
class ApiKeyRejectedController {
  @Get()
  @Auth(Role.viewer())
  get(): void {}
}

@Controller('local-auth-copy')
class LocalAuthCopyController {
  @Get()
  @Auth(Role.viewer())
  @ApiHeader({ name: 'x-owox-authorization', required: true })
  get(): void {}
}

@Controller('public')
class PublicController {
  @Get()
  @Auth(Role.none())
  get(): void {}
}

describe('Auth OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        EligibleController,
        ApiKeyRejectedController,
        LocalAuthCopyController,
        PublicController,
        ApiKeyExchangeController,
      ],
      providers: [{ provide: ExchangeProjectMemberApiKeyService, useValue: {} }],
    })
      .overrideGuard(IdpGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    document = createSwaggerDocument(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('documents the canonical OWOX authentication headers for eligible operations', () => {
    const operation = document.paths['/eligible']?.get;
    const parameters = operation?.parameters;

    expect(operation?.security).toEqual([{ 'X-OWOX-Authorization': [] }]);
    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'X-OWOX-Api-Key-Id',
          in: 'header',
          required: false,
          description: expect.stringMatching(/required.*match.*API key ID/i),
        }),
      ])
    );
  });

  it('omits API-key metadata from authenticated operations that reject API keys', () => {
    const operation = document.paths['/api-key-rejected']?.get;
    const parameters = operation?.parameters;

    expect(operation?.security).toEqual([{ 'X-OWOX-Authorization': [] }]);
    expect(parameters).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'X-OWOX-Api-Key-Id',
          in: 'header',
        }),
      ])
    );
  });

  it('omits authentication metadata from public operations', () => {
    const operation = document.paths['/public']?.get;
    const parameters = operation?.parameters;

    expect(operation?.security).toBeUndefined();
    expect(parameters ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringMatching(/^X-OWOX-/),
          in: 'header',
        }),
      ])
    );
  });

  it('defines the X-OWOX authorization security scheme used by protected operations', () => {
    expect(document.components?.securitySchemes).toMatchObject({
      'X-OWOX-Authorization': {
        type: 'apiKey',
        in: 'header',
        name: 'X-OWOX-Authorization',
        description: expect.stringContaining('Bearer'),
      },
    });
  });

  it('removes endpoint-local copies of the shared authorization input', () => {
    const parameters = document.paths['/local-auth-copy']?.get?.parameters ?? [];

    expect(parameters).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringMatching(/^x-owox-authorization$/i),
          in: 'header',
        }),
      ])
    );
  });

  it('keeps the API-key exchange header required without bearer-token security metadata', () => {
    const operation = document.paths['/auth/api-keys/exchange']?.post;

    expect(operation?.security).toBeUndefined();
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'X-OWOX-Api-Key-Id',
          in: 'header',
          required: true,
        }),
      ])
    );
  });
});
