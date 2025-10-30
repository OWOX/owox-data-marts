import { Injectable } from '@nestjs/common';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';
import { StorageConfigBuilder } from './storage-config.builder.interface';
import { DataMart } from '../../../entities/data-mart.entity';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { AthenaConfig } from '../../../data-storage-types/athena/schemas/athena-config.schema';
import { AthenaCredentials } from '../../../data-storage-types/athena/schemas/athena-credentials.schema';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';

const { StorageConfig } = Core;
type StorageConfig = InstanceType<typeof Core.StorageConfig>;

/**
 * Builder for AWS Athena storage configuration
 */
@Injectable()
export class AthenaStorageConfigBuilder implements StorageConfigBuilder {
  build(dataMart: DataMart, connector: DataMartConnectorDefinition['connector']): StorageConfig {
    const storageConfig = dataMart.storage.config as AthenaConfig;
    const credentials = dataMart.storage.credentials as AthenaCredentials;
    const clearBucketName = storageConfig.outputBucket.replace(/^s3:\/\//, '').replace(/\/$/, '');

    return new StorageConfig({
      name: DataStorageType.AWS_ATHENA,
      config: {
        AWSRegion: storageConfig.region,
        AWSAccessKeyId: credentials.accessKeyId,
        AWSSecretAccessKey: credentials.secretAccessKey,
        S3BucketName: clearBucketName,
        S3Prefix: dataMart.id,
        AthenaDatabaseName: connector.storage?.fullyQualifiedName.split('.')[0],
        DestinationTableNameOverride: `${connector.source.node} ${connector.storage?.fullyQualifiedName.split('.')[1]}`,
        AthenaOutputLocation: `s3://${clearBucketName}/owox-data-marts/${dataMart.id}`,
      },
    });
  }
}
