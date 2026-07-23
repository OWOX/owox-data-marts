import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

jest.mock('../../../mappers/http-data.mapper', () => ({
  HttpDataMapper: jest.fn(),
}));

jest.mock('../../../use-cases/stream-http-data.service', () => ({
  StreamHttpDataService: jest.fn(),
}));

jest.mock('../../../../idp', () => ({
  ...jest.requireActual('../../../../idp/decorators/auth.decorator'),
  ...jest.requireActual('../../../../idp/decorators/auth-context.decorator'),
  ...jest.requireActual('../../../../idp/types/role-config.types'),
}));

import { IdpGuard } from '../../../../idp/guards/idp.guard';
import { HttpDataController } from '../../external/http-data.controller';
import { HttpDataMapper } from '../../../mappers/http-data.mapper';
import { StreamHttpDataService } from '../../../use-cases/stream-http-data.service';

describe('HttpDataController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [HttpDataMapper, StreamHttpDataService].map(provide => ({
      provide,
      useValue: {},
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [HttpDataController],
      providers,
    })
      .overrideGuard(IdpGuard)
      .useValue({ canActivate: () => true })
      .compile();

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

  function streamOperation(): Record<string, any> {
    const operation = document.paths['/api/external/http-data/data-marts/{dataMartId}.ndjson']?.get;
    expect(operation).toBeDefined();
    return operation as Record<string, any>;
  }

  function parametersByName(): Record<string, Record<string, any>> {
    return Object.fromEntries(
      (streamOperation().parameters ?? []).map((parameter: Record<string, any>) => [
        parameter.name,
        parameter,
      ])
    );
  }

  it('publishes the stable HTTP Data operation identity and parameter contract', () => {
    const operation = streamOperation();
    const parameters = parametersByName();

    expect(operation).toMatchObject({
      operationId: 'HttpDataController_stream',
      summary: 'Stream Data Mart data as NDJSON',
      tags: ['HTTP Data'],
      security: [{ 'X-OWOX-Authorization': [] }],
    });
    expect(Reflect.getMetadata('roleConfig', HttpDataController.prototype.stream)).toEqual({
      role: 'viewer',
      strategy: 'introspect',
    });
    expect(parameters.dataMartId).toMatchObject({
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
    expect(parameters.columns).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['*', '**'] },
    });
    expect(parameters.column).toMatchObject({
      in: 'query',
      required: false,
      schema: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
      },
    });
    expect(parameters.limit).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1 },
    });
  });

  it.each(['filter', 'sort', 'aggregation', 'dateTrunc'])(
    'publishes %s as an optional bounded base64url string',
    name => {
      const parameter = parametersByName()[name];

      expect(parameter).toMatchObject({
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
          maxLength: 8192,
        },
      });
      expect(parameter.description).toMatch(/base64url/i);
    }
  );

  it('publishes the NDJSON response, run ID header, and endpoint-specific failures', () => {
    const responses = streamOperation().responses;

    expect(responses['200']).toMatchObject({
      headers: {
        'x-owox-run-id': {
          schema: { type: 'string' },
        },
      },
      content: {
        'application/x-ndjson': {
          schema: { type: 'string' },
        },
      },
    });
    expect(Object.keys(responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '424', '503'])
    );
    expect(responses['400'].description).toMatch(
      /unknown column.*pagination.*aggregation.*dateTrunc.*storage type.*project blocked/i
    );
    expect(responses['401'].description).toBe('Authentication required');
    expect(responses['403'].description).toMatch(/Business User.*Action\.USE/i);
    expect(responses['404'].description).toMatch(/not visible.*not published/i);
    expect(responses['424'].description).toMatch(/storage dependency.*provider context/i);
    expect(responses['503'].description).toMatch(/server is shutting down/i);
  });
});
