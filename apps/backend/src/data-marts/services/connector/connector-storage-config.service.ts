// connector-storage-config.service.ts
import { Injectable, Logger } from '@nestjs/common';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { StorageConfigDto } = Core;
type StorageConfigDto = InstanceType<typeof Core.StorageConfigDto>;

import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { BigQueryConfig } from '../../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { AthenaConfig } from '../../data-storage-types/athena/schemas/athena-config.schema';
import { AthenaCredentials } from '../../data-storage-types/athena/schemas/athena-credentials.schema';
import {
  BIGQUERY_OAUTH_TYPE,
  type BigQueryCredentials,
  type BigQueryOAuthCredentials,
} from '../../data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import { SnowflakeConfig } from '../../data-storage-types/snowflake/schemas/snowflake-config.schema';
import { SnowflakeCredentials } from '../../data-storage-types/snowflake/schemas/snowflake-credentials.schema';
import { RedshiftConfig } from '../../data-storage-types/redshift/schemas/redshift-config.schema';
import { RedshiftCredentials } from '../../data-storage-types/redshift/schemas/redshift-credentials.schema';
import { RedshiftConnectionType } from '../../data-storage-types/redshift/enums/redshift-connection-type.enum';
import { DatabricksConfig } from '../../data-storage-types/databricks/schemas/databricks-config.schema';
import { DatabricksCredentials } from '../../data-storage-types/databricks/schemas/databricks-credentials.schema';
import { ConnectorExecutionError } from '../../errors/connector-execution.error';
import { DataStorageCredentialsResolver } from '../../data-storage-types/data-storage-credentials-resolver.service';
import { DataStorageCredentials } from '../../data-storage-types/data-storage-credentials.type';
import { GoogleOAuthConfigService } from '../google-oauth/google-oauth-config.service';

@Injectable()
export class ConnectorStorageConfigService {
  private readonly logger = new Logger(ConnectorStorageConfigService.name);

  constructor(
    private readonly storageCredentialsResolver: DataStorageCredentialsResolver,
    private readonly googleOAuthConfigService: GoogleOAuthConfigService
  ) {}

  async buildStorageConfig(dataMart: DataMart): Promise<StorageConfigDto> {
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;
    const credentials = await this.storageCredentialsResolver.resolve(dataMart.storage);

    switch (dataMart.storage.type as DataStorageType) {
      case DataStorageType.GOOGLE_BIGQUERY:
        return this.createBigQueryStorageConfig(dataMart, connector, credentials);
      case DataStorageType.AWS_ATHENA:
        return this.createAthenaStorageConfig(dataMart, connector, credentials);
      case DataStorageType.SNOWFLAKE:
        return this.createSnowflakeStorageConfig(dataMart, connector, credentials);
      case DataStorageType.AWS_REDSHIFT:
        return this.createRedshiftStorageConfig(dataMart, connector, credentials);
      case DataStorageType.DATABRICKS:
        return this.createDatabricksStorageConfig(dataMart, connector, credentials);
      default:
        throw new ConnectorExecutionError(
          `Unsupported storage type: ${dataMart.storage.type}`,
          undefined,
          {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            storageType: dataMart.storage.type,
          }
        );
    }
  }

  private async createBigQueryStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector'],
    credentials: DataStorageCredentials
  ): Promise<StorageConfigDto> {
    const storageConfig = dataMart.storage.config as BigQueryConfig;
    const bqCredentials = credentials as BigQueryCredentials;
    const datasetId = connector.storage?.fullyQualifiedName.split('.')[0];

    const baseConfig = {
      DestinationLocation: storageConfig?.location,
      DestinationDatasetID: `${storageConfig.projectId}.${datasetId}`,
      DestinationProjectID: storageConfig.projectId,
      DestinationDatasetName: datasetId,
      DestinationTableNameOverride: `${connector.source.node} ${connector.storage?.fullyQualifiedName.split('.')[1]}`,
      ProjectID: storageConfig.projectId,
    };

    if (bqCredentials.type === BIGQUERY_OAUTH_TYPE) {
      const oauthCredentials = bqCredentials as BigQueryOAuthCredentials;
      const tokenResponse = await oauthCredentials.oauth2Client.getAccessToken();
      const accessToken = tokenResponse.token;
      if (!accessToken) {
        throw new ConnectorExecutionError(
          'Failed to obtain OAuth access token for BigQuery',
          undefined,
          { dataMartId: dataMart.id, projectId: dataMart.projectId }
        );
      }
      const refreshToken = oauthCredentials.oauth2Client.credentials.refresh_token;

      return new StorageConfigDto({
        name: DataStorageType.GOOGLE_BIGQUERY,
        config: {
          ...baseConfig,
          OAuthAccessToken: accessToken,
          OAuthRefreshToken: refreshToken ?? '',
          OAuthClientId: this.googleOAuthConfigService.getStorageClientId(),
          OAuthClientSecret: this.googleOAuthConfigService.getStorageClientSecret(),
        },
      });
    }

    return new StorageConfigDto({
      name: DataStorageType.GOOGLE_BIGQUERY,
      config: {
        ...baseConfig,
        ServiceAccountJson: JSON.stringify(bqCredentials),
      },
    });
  }

  private createAthenaStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector'],
    credentials: DataStorageCredentials
  ): StorageConfigDto {
    const storageConfig = dataMart.storage.config as AthenaConfig;
    const athenaCredentials = credentials as AthenaCredentials;
    const clearBucketName = storageConfig.outputBucket.replace(/^s3:\/\//, '').replace(/\/$/, '');
    return new StorageConfigDto({
      name: DataStorageType.AWS_ATHENA,
      config: {
        AWSRegion: storageConfig.region,
        AWSAccessKeyId: athenaCredentials.accessKeyId,
        AWSSecretAccessKey: athenaCredentials.secretAccessKey,
        S3BucketName: clearBucketName,
        S3Prefix: dataMart.id,
        AthenaDatabaseName: connector.storage?.fullyQualifiedName.split('.')[0],
        DestinationTableNameOverride: `${connector.source.node} ${connector.storage?.fullyQualifiedName.split('.')[1]}`,
        AthenaOutputLocation: `s3://${clearBucketName}/owox-data-marts/${dataMart.id}`,
      },
    });
  }

  private createSnowflakeStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector'],
    credentials: DataStorageCredentials
  ): StorageConfigDto {
    const storageConfig = dataMart.storage.config as SnowflakeConfig;
    const sfCredentials = credentials as SnowflakeCredentials;

    const fqnParts = connector.storage?.fullyQualifiedName.split('.') || [];
    const database = fqnParts[0];
    const schema = fqnParts[1];
    const tableName = fqnParts[2];

    const baseConfig = {
      SnowflakeAccount: storageConfig.account,
      SnowflakeWarehouse: storageConfig.warehouse,
      SnowflakeDatabase: database,
      SnowflakeSchema: schema,
      SnowflakeRole: storageConfig.role || '',
      DestinationTableNameOverride: `${connector.source.node} ${tableName}`,
      SnowflakeUsername: sfCredentials.username,
    };

    const authConfig =
      sfCredentials.authMethod === 'PASSWORD'
        ? {
            SnowflakePassword: sfCredentials.password,
            SnowflakeAuthenticator: 'SNOWFLAKE',
            SnowflakePrivateKey: '',
            SnowflakePrivateKeyPassphrase: '',
          }
        : {
            SnowflakePassword: '',
            SnowflakeAuthenticator: 'SNOWFLAKE_JWT',
            SnowflakePrivateKey: sfCredentials.privateKey,
            SnowflakePrivateKeyPassphrase: sfCredentials.privateKeyPassphrase || '',
          };

    return new StorageConfigDto({
      name: DataStorageType.SNOWFLAKE,
      config: { ...baseConfig, ...authConfig },
    });
  }

  private createRedshiftStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector'],
    credentials: DataStorageCredentials
  ): StorageConfigDto {
    const storageConfig = dataMart.storage.config as RedshiftConfig;
    const rsCredentials = credentials as RedshiftCredentials;

    const fqnParts = connector.storage?.fullyQualifiedName.split('.') || [];

    const unquoteIdentifier = (identifier: string): string => {
      if (!identifier) return '';
      if (identifier.startsWith('"') && identifier.endsWith('"')) {
        return identifier.slice(1, -1);
      }
      return identifier;
    };

    let schema: string;
    let tableName: string;

    if (fqnParts.length === 3) {
      schema = unquoteIdentifier(fqnParts[1]);
      tableName = unquoteIdentifier(fqnParts[2]);
    } else {
      schema = unquoteIdentifier(fqnParts[0]);
      tableName = unquoteIdentifier(fqnParts[1]);
    }

    if (!schema || !schema.trim()) {
      throw new ConnectorExecutionError(
        'Schema name is required in connector configuration',
        undefined,
        {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          storageType: dataMart.storage.type,
        }
      );
    }
    if (!tableName || !tableName.trim()) {
      throw new ConnectorExecutionError(
        'Table name is required in connector configuration',
        undefined,
        {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          storageType: dataMart.storage.type,
        }
      );
    }

    return new StorageConfigDto({
      name: DataStorageType.AWS_REDSHIFT,
      config: {
        AWSRegion: storageConfig.region,
        AWSAccessKeyId: rsCredentials.accessKeyId,
        AWSSecretAccessKey: rsCredentials.secretAccessKey,
        Database: storageConfig.database,
        Schema: schema,
        WorkgroupName:
          storageConfig.connectionType === RedshiftConnectionType.SERVERLESS
            ? storageConfig.workgroupName
            : '',
        ClusterIdentifier:
          storageConfig.connectionType === RedshiftConnectionType.PROVISIONED
            ? storageConfig.clusterIdentifier
            : '',
        DestinationTableNameOverride: `${connector.source.node} ${tableName}`,
      },
    });
  }

  private createDatabricksStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector'],
    credentials: DataStorageCredentials
  ): StorageConfigDto {
    const storageConfig = dataMart.storage.config as DatabricksConfig;
    const dbCredentials = credentials as DatabricksCredentials;

    const fqnParts = connector.storage?.fullyQualifiedName.split('.') || [];
    const catalog = fqnParts[0];
    const schema = fqnParts[1];
    const tableName = fqnParts[2];

    if (!catalog || !catalog.trim()) {
      throw new ConnectorExecutionError(
        'Catalog name is required in connector configuration',
        undefined,
        {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          storageType: dataMart.storage.type,
        }
      );
    }
    if (!schema || !schema.trim()) {
      throw new ConnectorExecutionError(
        'Schema name is required in connector configuration',
        undefined,
        {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          storageType: dataMart.storage.type,
        }
      );
    }
    if (!tableName || !tableName.trim()) {
      throw new ConnectorExecutionError(
        'Table name is required in connector configuration',
        undefined,
        {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          storageType: dataMart.storage.type,
        }
      );
    }

    return new StorageConfigDto({
      name: DataStorageType.DATABRICKS,
      config: {
        DatabricksHost: storageConfig.host,
        DatabricksHttpPath: storageConfig.httpPath,
        DatabricksToken: dbCredentials.token,
        DatabricksCatalog: catalog,
        DatabricksSchema: schema,
        DestinationTableNameOverride: `${connector.source.node} ${tableName}`,
      },
    });
  }
}
