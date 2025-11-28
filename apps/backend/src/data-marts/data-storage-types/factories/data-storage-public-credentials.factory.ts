import { Injectable } from '@nestjs/common';
import { AthenaCredentialsSchema } from '../athena/schemas/athena-credentials.schema';
import { BigQueryCredentialsSchema } from '../bigquery/schemas/bigquery-credentials.schema';
import { SnowflakeCredentialsSchema } from '../snowflake/schemas/snowflake-credentials.schema';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageCredentialsPublic } from '../../dto/presentation/data-storage-response-api.dto';

@Injectable()
export class DataStoragePublicCredentialsFactory {
  create(type: DataStorageType, credentials: unknown): DataStorageCredentialsPublic {
    if (!credentials) {
      throw new Error(`Credentials are required for storage type: ${type}`);
    }

    switch (type) {
      case DataStorageType.GOOGLE_BIGQUERY: {
        const validatedCredentials = BigQueryCredentialsSchema.parse(credentials);
        return {
          type: validatedCredentials.type,
          project_id: validatedCredentials.project_id,
          client_id: validatedCredentials.client_id,
          client_email: validatedCredentials.client_email,
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

      default: {
        throw new Error(`Unsupported data storage type: ${type}`);
      }
    }
  }
}
