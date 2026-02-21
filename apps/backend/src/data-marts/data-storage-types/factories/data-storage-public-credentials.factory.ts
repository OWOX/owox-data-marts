import { Injectable } from '@nestjs/common';
import { AthenaCredentialsSchema } from '../athena/schemas/athena-credentials.schema';
import { BigQueryServiceAccountCredentialsSchema } from '../bigquery/schemas/bigquery-credentials.schema';
import { SnowflakeCredentialsSchema } from '../snowflake/schemas/snowflake-credentials.schema';
import { RedshiftCredentialsSchema } from '../redshift/schemas/redshift-credentials.schema';
import { DatabricksCredentialsSchema } from '../databricks/schemas/databricks-credentials.schema';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageCredentialsPublic } from '../../dto/presentation/data-storage-response-api.dto';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { isBigQueryOAuthCredentials } from '../data-storage-credentials.guards';

@Injectable()
export class DataStoragePublicCredentialsFactory {
  create(
    type: DataStorageType,
    credentials: DataStorageCredentials
  ): DataStorageCredentialsPublic | undefined {
    switch (type) {
      case DataStorageType.GOOGLE_BIGQUERY:
      case DataStorageType.LEGACY_GOOGLE_BIGQUERY: {
        if (isBigQueryOAuthCredentials(credentials)) {
          // OAuth credentials are not supported in public API
          return undefined;
        }
        const result = BigQueryServiceAccountCredentialsSchema.safeParse(credentials);
        if (!result.success) {
          return undefined;
        }
        return {
          type: result.data.type,
          project_id: result.data.project_id,
          client_id: result.data.client_id,
          client_email: result.data.client_email,
        };
      }

      case DataStorageType.AWS_ATHENA: {
        const validatedCredentials = AthenaCredentialsSchema.parse(credentials);
        return {
          accessKeyId: validatedCredentials.accessKeyId,
        };
      }

      case DataStorageType.SNOWFLAKE: {
        const validatedCredentials = SnowflakeCredentialsSchema.parse(credentials);
        return {
          authMethod: validatedCredentials.authMethod,
          username: validatedCredentials.username,
        };
      }

      case DataStorageType.AWS_REDSHIFT: {
        const validatedCredentials = RedshiftCredentialsSchema.parse(credentials);
        return {
          accessKeyId: validatedCredentials.accessKeyId,
        };
      }

      case DataStorageType.DATABRICKS: {
        const validatedCredentials = DatabricksCredentialsSchema.parse(credentials);
        return {
          authMethod: validatedCredentials.authMethod,
        };
      }

      default: {
        throw new Error(`Unsupported data storage type: ${type}`);
      }
    }
  }
}
