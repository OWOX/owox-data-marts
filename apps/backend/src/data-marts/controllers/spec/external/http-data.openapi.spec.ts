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

  function operationFor(pathNeedle: string): Record<string, any> {
    const path = Object.keys(document.paths).find(p => p.includes(pathNeedle));
    expect(path).toBeDefined();
    const operation = document.paths[path!]?.get;
    expect(operation).toBeDefined();
    return operation as Record<string, any>;
  }

  function parametersFor(pathNeedle: string): Array<Record<string, any>> {
    return (operationFor(pathNeedle).parameters ?? []) as Array<Record<string, any>>;
  }

  function parametersByNameFor(pathNeedle: string): Record<string, Record<string, any>> {
    return Object.fromEntries(
      parametersFor(pathNeedle).map((parameter: Record<string, any>) => [parameter.name, parameter])
    );
  }

  function queryParam(name: string): Record<string, any> | undefined {
    return parametersFor('http-data/data-marts').find(p => p.name === name && p.in === 'query');
  }

  it('publishes the stable HTTP Data operation identity and parameter contract', () => {
    const operation = operationFor('http-data/data-marts');
    const parameters = parametersByNameFor('http-data/data-marts');

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
      const parameter = queryParam(name);

      expect(parameter).toMatchObject({
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
          maxLength: 8192,
        },
      });
      expect(parameter?.description).toMatch(/base64url/i);
    }
  );

  it('publishes the NDJSON response, run ID header, and endpoint-specific failures', () => {
    const responses = operationFor('http-data/data-marts').responses;

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
    expect(responses['403'].description).toMatch(/Business User/i);
    expect(responses['403'].description).toMatch(/Action\.USE/i);
    expect(responses['403'].description.match(/Business User/gi)).toHaveLength(1);
    expect(responses['404'].description).toMatch(/not visible.*not published/i);
    expect(responses['424'].description).toMatch(/storage dependency.*provider context/i);
    expect(responses['503'].description).toMatch(/server is shutting down/i);
  });

  it('documents the report route with only an optional limit query param', () => {
    const params = parametersFor('http-data/reports');
    const queryParams = params.filter(p => p.in === 'query');
    expect(queryParams.map(p => p.name)).toEqual(['limit']);
    expect(queryParams[0]?.required).toBe(false);
    expect(params.some(p => p.name === 'reportId' && p.in === 'path')).toBe(true);
  });
});
