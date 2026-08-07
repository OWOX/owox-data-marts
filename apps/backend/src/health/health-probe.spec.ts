import { getDataSourceToken } from '@nestjs/typeorm';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { DataSource } from 'typeorm';
import { PLUGIN_COLLECTIONS_DATA_SOURCE } from '../config/plugin-collections-data-source-options.config';
import { createHealthProbe } from './health-probe';

describe('createHealthProbe', () => {
  function appWith(main: jest.Mock, collections: jest.Mock): NestExpressApplication {
    return {
      get: (token: unknown) =>
        token === getDataSourceToken(PLUGIN_COLLECTIONS_DATA_SOURCE)
          ? ({ query: collections } as Pick<DataSource, 'query'>)
          : ({ query: main } as Pick<DataSource, 'query'>),
    } as unknown as NestExpressApplication;
  }

  it('is healthy only when both databases answer', async () => {
    const main = jest.fn().mockResolvedValue([{ 1: 1 }]);
    const collections = jest.fn().mockResolvedValue([{ 1: 1 }]);

    await expect(createHealthProbe(appWith(main, collections)).isHealthy()).resolves.toBe(true);
    expect(main).toHaveBeenCalledWith('SELECT 1');
    expect(collections).toHaveBeenCalledWith('SELECT 1');
  });

  it('reports an outage of the isolated collections database', async () => {
    const main = jest.fn().mockResolvedValue([{ 1: 1 }]);
    const collections = jest.fn().mockRejectedValue(new Error('collections unavailable'));

    await expect(createHealthProbe(appWith(main, collections)).isHealthy()).resolves.toBe(false);
  });
});
