import { Injectable } from '@nestjs/common';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';
import { StorageConfigBuilder } from './storage-config.builder.interface';
import { DataMart } from '../../../entities/data-mart.entity';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { BigQueryConfig } from '../../../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { BigQueryCredentials } from '../../../data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';

const { StorageConfig } = Core;
type StorageConfig = InstanceType<typeof Core.StorageConfig>;

/**
 * Builder for Google BigQuery storage configuration
 */
@Injectable()
export class BigQueryStorageConfigBuilder implements StorageConfigBuilder {
  build(dataMart: DataMart, connector: DataMartConnectorDefinition['connector']): StorageConfig {
    const storageConfig = dataMart.storage.config as BigQueryConfig;
    const credentials = dataMart.storage.credentials as BigQueryCredentials;
    const datasetId = connector.storage?.fullyQualifiedName.split('.')[0];

    return new StorageConfig({
      name: DataStorageType.GOOGLE_BIGQUERY,
      config: {
        DestinationLocation: storageConfig?.location,
        DestinationDatasetID: `${storageConfig.projectId}.${datasetId}`,
        DestinationProjectID: storageConfig.projectId,
        DestinationDatasetName: datasetId,
        DestinationTableNameOverride: `${connector.source.node} ${connector.storage?.fullyQualifiedName.split('.')[1]}`,
        ProjectID: storageConfig.projectId,
        ServiceAccountJson: JSON.stringify(credentials),
      },
    });
  }
}
