jest.mock('../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    Role: { editor: () => 'editor', viewer: () => 'viewer' },
    Strategy: { INTROSPECT: 'INTROSPECT', PARSE: 'PARSE' },
  };
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as supertest from 'supertest';
import { setupGlobalPipes } from '../../config/global-pipes.config';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { DataQualityApiMapper } from '../mappers/data-quality-api.mapper';
import { DataQualityApiService } from '../services/data-quality-api.service';
import { DataQualityBatchController, DataQualityController } from './data-quality.controller';

describe('DataQuality controllers', () => {
  const context = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
  } as AuthorizationContext;
  const service = {
    getConfig: jest.fn(),
    replaceConfig: jest.fn(),
    run: jest.fn(),
    runBatch: jest.fn(),
    getSummaries: jest.fn(),
    getLatest: jest.fn(),
  };
  const mapper = new DataQualityApiMapper();
  const controller = new DataQualityController(service as unknown as DataQualityApiService, mapper);
  const batchController = new DataQualityBatchController(
    service as unknown as DataQualityApiService,
    mapper
  );

  beforeEach(() => jest.resetAllMocks());

  it('keeps configuration writes separate from a config-free Run command', async () => {
    const config = { rules: [] };
    service.replaceConfig.mockResolvedValue({});
    service.run.mockResolvedValue({ runId: 'run-1' });

    await controller.replaceConfig(context, 'dm-1', config);
    await controller.replaceConfig(context, 'dm-1', null);
    await controller.run(context, 'dm-1');

    expect(service.replaceConfig).toHaveBeenNthCalledWith(1, context, 'dm-1', config);
    expect(service.replaceConfig).toHaveBeenNthCalledWith(2, context, 'dm-1', null);
    expect(service.run).toHaveBeenCalledWith(context, 'dm-1');
  });

  it('maps stable de-duplicated ids into the static batch service', async () => {
    service.runBatch.mockResolvedValue({ items: [] });
    await batchController.runBatch(context, { dataMartIds: ['dm-b', 'dm-a', 'dm-b'] });
    expect(service.runBatch).toHaveBeenCalledWith(context, ['dm-b', 'dm-a']);
    expect(Reflect.getMetadata('__httpCode__', DataQualityBatchController.prototype.runBatch)).toBe(
      200
    );
  });

  it('forwards more than 200 selected Data Marts without truncation', async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `dm-${index}`);
    service.runBatch.mockResolvedValue({ items: [] });

    await batchController.runBatch(context, { dataMartIds: ids });

    expect(service.runBatch).toHaveBeenCalledWith(context, ids);
  });

  it('maps stable de-duplicated ids into the summaries service', async () => {
    service.getSummaries.mockResolvedValue({ items: [] });

    await batchController.getSummaries(context, {
      dataMartIds: ['dm-b', 'dm-a', 'dm-b'],
    });

    expect(service.getSummaries).toHaveBeenCalledWith(context, ['dm-b', 'dm-a']);
    expect(
      Reflect.getMetadata('__httpCode__', DataQualityBatchController.prototype.getSummaries)
    ).toBe(200);
  });

  it('keeps latest and does not expose a DQ-specific detail handler', async () => {
    service.getLatest.mockResolvedValue(null);
    await expect(controller.getLatest(context, 'dm-1')).resolves.toBeNull();
    expect(
      (DataQualityController.prototype as unknown as { getDetail?: unknown }).getDetail
    ).toBeUndefined();
  });

  describe('run request HTTP contract', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [DataQualityController],
        providers: [
          { provide: DataQualityApiService, useValue: service },
          { provide: DataQualityApiMapper, useValue: mapper },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api');
      setupGlobalPipes(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it.each([
      ['JSON null', 'null'],
      ['an array', []],
      ['a number', '42'],
      ['a string', '"stale-client"'],
      ['an unknown property', { unsupportedProperty: true }],
      ['an invalid revision', { configRevision: 'A'.repeat(64) }],
    ])('rejects %s instead of starting a config-free run', async (_name, body) => {
      service.run.mockResolvedValue({ runId: 'run-1' });

      const request = supertest
        .default(app.getHttpServer())
        .post('/api/data-marts/dm-1/data-quality/runs')
        .set('Content-Type', 'application/json');
      const response = await request.send(body);
      expect({
        status: response.status,
        body: response.body,
        text: response.text,
      }).toMatchObject({ status: 400 });

      expect(service.run).not.toHaveBeenCalled();
    });

    it.each([
      ['an omitted body', undefined],
      ['an empty object', {}],
      ['a valid revision', { configRevision: 'a'.repeat(64) }],
    ])('accepts %s', async (_name, body) => {
      service.run.mockResolvedValue({ runId: 'run-1' });

      const request = supertest
        .default(app.getHttpServer())
        .post('/api/data-marts/dm-1/data-quality/runs');
      if (body !== undefined) request.send(body);
      await request.expect(201, { runId: 'run-1' });
    });
  });
});
