import { DataSourceOptions } from 'typeorm';
import * as entities from '../entities/index.js';

/**
 * Creates database configuration with primitive types only
 * Completely database-agnostic - works with any TypeORM-supported database
 *
 * @param connectionOptions Any TypeORM connection options
 * @returns Complete DataSourceOptions with entities included
 */
export function createDatabaseConfig(
  connectionOptions: Partial<DataSourceOptions>
): DataSourceOptions {
  const baseConfig: Partial<DataSourceOptions> = {
    entities: Object.values(entities),
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
    ...connectionOptions,
  };

  return baseConfig as DataSourceOptions;
}
