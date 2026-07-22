import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

jest.mock('../../../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  Role: {
    viewer: jest.fn(),
  },
}));

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

  function parametersFor(pathNeedle: string): Array<Record<string, any>> {
    const path = Object.keys(document.paths).find(p => p.includes(pathNeedle));
    expect(path).toBeDefined();
    return (document.paths[path!]?.get?.parameters ?? []) as Array<Record<string, any>>;
  }

  function queryParam(name: string): Record<string, any> | undefined {
    return parametersFor('http-data/data-marts').find(p => p.name === name && p.in === 'query');
  }

  it('documents the aggregation query parameter as an optional base64url string', () => {
    const aggregation = queryParam('aggregation');
    expect(aggregation).toBeDefined();
    expect(aggregation?.required).toBe(false);
    expect(aggregation?.schema?.type).toBe('string');
    expect(aggregation?.description).toMatch(/base64url/i);
  });

  it('documents the dateTrunc query parameter as an optional base64url string', () => {
    const dateTrunc = queryParam('dateTrunc');
    expect(dateTrunc).toBeDefined();
    expect(dateTrunc?.required).toBe(false);
    expect(dateTrunc?.schema?.type).toBe('string');
    expect(dateTrunc?.description).toMatch(/base64url/i);
  });

  it('still documents the pre-existing filter and sort query parameters', () => {
    expect(queryParam('filter')).toBeDefined();
    expect(queryParam('sort')).toBeDefined();
  });

  it('documents the report route with only an optional limit query param', () => {
    const params = parametersFor('http-data/reports');
    const queryParams = params.filter(p => p.in === 'query');
    expect(queryParams.map(p => p.name)).toEqual(['limit']);
    expect(queryParams[0]?.required).toBe(false);
    expect(params.some(p => p.name === 'reportId' && p.in === 'path')).toBe(true);
  });
});
