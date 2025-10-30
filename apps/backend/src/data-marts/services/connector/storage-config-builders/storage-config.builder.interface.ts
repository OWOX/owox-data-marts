// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';
import { DataMart } from '../../../entities/data-mart.entity';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/connector-definition.schema';

type StorageConfig = InstanceType<typeof Core.StorageConfig>;

/**
 * Interface for building storage-specific configurations
 * Implements Strategy Pattern for different storage types
 */
export interface StorageConfigBuilder {
  /**
   * Build storage configuration for a specific storage type
   * @param dataMart - The data mart entity
   * @param connector - The connector definition
   * @returns StorageConfig instance
   */
  build(dataMart: DataMart, connector: DataMartConnectorDefinition['connector']): StorageConfig;
}
