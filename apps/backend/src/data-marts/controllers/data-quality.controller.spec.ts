jest.mock('../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    Role: { editor: () => 'editor', viewer: () => 'viewer' },
    Strategy: { INTROSPECT: 'INTROSPECT', PARSE: 'PARSE' },
  };
});

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
    getLatest: jest.fn(),
    getDetail: jest.fn(),
  };
  const mapper = new DataQualityApiMapper();
  const controller = new DataQualityController(service as unknown as DataQualityApiService, mapper);
  const batchController = new DataQualityBatchController(
    service as unknown as DataQualityApiService,
    mapper
  );

  beforeEach(() => jest.resetAllMocks());

  it('maps PUT plain config/null and POST {} / {config}', async () => {
    const config = { timezone: 'UTC', rules: [] };
    service.replaceConfig.mockResolvedValue({});
    service.run.mockResolvedValue({ runId: 'run-1' });

    await controller.replaceConfig(context, 'dm-1', config);
    await controller.replaceConfig(context, 'dm-1', null);
    await controller.run(context, 'dm-1', {});
    await controller.run(context, 'dm-1', { config: null });

    expect(service.replaceConfig).toHaveBeenNthCalledWith(1, context, 'dm-1', config);
    expect(service.replaceConfig).toHaveBeenNthCalledWith(2, context, 'dm-1', null);
    expect(service.run).toHaveBeenNthCalledWith(1, context, 'dm-1', { hasConfig: false });
    expect(service.run).toHaveBeenNthCalledWith(2, context, 'dm-1', {
      hasConfig: true,
      config: null,
    });
  });

  it('maps stable de-duplicated ids into the static batch service', async () => {
    service.runBatch.mockResolvedValue({ items: [] });
    await batchController.runBatch(context, { dataMartIds: ['dm-b', 'dm-a', 'dm-b'] });
    expect(service.runBatch).toHaveBeenCalledWith(context, ['dm-b', 'dm-a']);
    expect(Reflect.getMetadata('__httpCode__', DataQualityBatchController.prototype.runBatch)).toBe(
      200
    );
  });

  it('delegates latest and detail using the public DataMartRun id', async () => {
    service.getLatest.mockResolvedValue(null);
    service.getDetail.mockResolvedValue({ dataMartRunId: 'run-1' });
    await expect(controller.getLatest(context, 'dm-1')).resolves.toBeNull();
    await expect(controller.getDetail(context, 'dm-1', 'run-1')).resolves.toEqual({
      dataMartRunId: 'run-1',
    });
  });
});
