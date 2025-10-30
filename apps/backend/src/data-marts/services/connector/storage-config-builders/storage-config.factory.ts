import { Injectable } from '@nestjs/common';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';
import { StorageConfigBuilder } from './storage-config.builder.interface';
import { BigQueryStorageConfigBuilder } from './bigquery-storage-config.builder';
import { AthenaStorageConfigBuilder } from './athena-storage-config.builder';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { DataMart } from '../../../entities/data-mart.entity';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { ConnectorExecutionError } from '../../../errors/connector-execution.error';

type StorageConfig = InstanceType<typeof Core.StorageConfig>;

/**
 * Factory for creating storage configurations using Strategy Pattern
 * Automatically selects appropriate builder based on storage type
 */
@Injectable()
export class StorageConfigFactory {
  private readonly builders: Map<DataStorageType, StorageConfigBuilder>;

  constructor(
    private readonly bigQueryBuilder: BigQueryStorageConfigBuilder,
    private readonly athenaBuilder: AthenaStorageConfigBuilder
  ) {
    this.builders = new Map([
      [DataStorageType.GOOGLE_BIGQUERY, this.bigQueryBuilder],
      [DataStorageType.AWS_ATHENA, this.athenaBuilder],
    ]);
  }

  /**
   * Create storage configuration for the given data mart
   * @param dataMart - The data mart entity
   * @param connector - The connector definition
   * @returns StorageConfig instance
   * @throws ConnectorExecutionError if storage type is not supported
   */
  createStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector']
  ): StorageConfig {
    const storageType = dataMart.storage.type as DataStorageType;
    const builder = this.builders.get(storageType);

    if (!builder) {
      throw new ConnectorExecutionError(`Unsupported storage type: ${storageType}`, undefined, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        storageType,
      });
    }

    return builder.build(dataMart, connector);
  }

  /**
   * Register a new storage config builder
   * @param storageType - The storage type
   * @param builder - The builder instance
   */
  registerBuilder(storageType: DataStorageType, builder: StorageConfigBuilder): void {
    this.builders.set(storageType, builder);
  }
}
