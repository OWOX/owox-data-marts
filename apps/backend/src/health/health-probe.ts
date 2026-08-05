import type { NestExpressApplication } from '@nestjs/platform-express';
import { getDataSourceToken } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';
import { PLUGIN_COLLECTIONS_DATA_SOURCE } from '../config/plugin-collections-data-source-options.config';

/**
 * Interface for components that can report their health status.
 */
export interface HealthProbeAware {
  /** Returns true if backend is healthy to serve requests (DB reachable), false otherwise. */
  isHealthy(): Promise<boolean>;
}

/**
 * Creates a HealthProbeAware implementation for the given NestExpressApplication.
 *
 * This implementation checks database connectivity by executing a minimal query.
 * @param app The NestExpressApplication instance to create the health probe for.
 */
export function createHealthProbe(app: NestExpressApplication): HealthProbeAware {
  return {
    async isHealthy(): Promise<boolean> {
      try {
        const dataSources = [
          app.get(DataSource),
          app.get<DataSource>(getDataSourceToken(PLUGIN_COLLECTIONS_DATA_SOURCE)),
        ];
        // Database-agnostic minimal query supported by MySQL/SQLite
        await Promise.all(dataSources.map(dataSource => dataSource.query('SELECT 1')));
        return true;
      } catch {
        return false;
      }
    },
  };
}
