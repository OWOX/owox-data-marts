import { z } from 'zod';
import { DataStorageCredentialsSafe } from '../dto/presentation/data-storage-response-api.dto';
import { AthenaCredentials } from './athena/schemas/athena-credentials.schema';
import { BigQueryCredentials } from './bigquery/schemas/bigquery-credentials.schema';
import { DataStorageCredentials } from './data-storage-credentials.type';
import { DataMartSchemaFieldStatus } from './enums/data-mart-schema-field-status.enum';
import { DataStorageType } from './enums/data-storage-type.enum';

export function createBaseFieldSchemaForType<T extends z.ZodTypeAny>(schemaFieldType: T) {
  const typedSchema = z
    .object({
      name: z.string().min(1, 'Case sensitive field name is required'),
      type: schemaFieldType,
      alias: z.string().optional().describe('Field alias for output'),
      description: z.string().optional().describe('Field description'),
      isPrimaryKey: z
        .boolean()
        .default(false)
        .describe('Is field must be a part of a data mart primary key'),
      status: z
        .nativeEnum(DataMartSchemaFieldStatus)
        .describe('Field status relatively to the actual data mart schema'),
    })
    .describe('Data mart schema field definition');
  return typedSchema;
}

function maskString(value: string): string {
  const length = value.length;

  if (length > 30) {
    return '*'.repeat(Math.min(20, Math.ceil(length / 3)));
  } else if (length > 10) {
    return '*'.repeat(Math.min(10, Math.ceil(length / 2)));
  } else {
    return '*'.repeat(length);
  }
}

export function sanitizeCredentials(
  type: DataStorageType,
  credentials: DataStorageCredentials | undefined
): DataStorageCredentialsSafe | undefined {
  if (!credentials) return undefined;

  if (type === DataStorageType.GOOGLE_BIGQUERY) {
    const bigQueryCredentials = credentials as BigQueryCredentials;
    return {
      type: bigQueryCredentials.type || 'service_account',
      project_id: bigQueryCredentials.project_id,
      client_id: bigQueryCredentials.client_id,
      client_email: bigQueryCredentials.client_email,
      private_key_id: bigQueryCredentials.private_key_id
        ? maskString(bigQueryCredentials.private_key_id)
        : undefined,
      private_key: bigQueryCredentials.private_key
        ? maskString(bigQueryCredentials.private_key)
        : undefined,
      client_x509_cert_url: bigQueryCredentials.client_x509_cert_url
        ? maskString(bigQueryCredentials.client_x509_cert_url)
        : undefined,
      auth_uri: bigQueryCredentials.auth_uri,
      token_uri: bigQueryCredentials.token_uri,
      auth_provider_x509_cert_url: bigQueryCredentials.auth_provider_x509_cert_url,
      universe_domain: bigQueryCredentials.universe_domain,
    };
  }

  if (type === DataStorageType.AWS_ATHENA) {
    const athenaCredentials = credentials as AthenaCredentials;
    return {
      accessKeyId: athenaCredentials.accessKeyId,
      secretAccessKey: athenaCredentials.secretAccessKey
        ? maskString(athenaCredentials.secretAccessKey)
        : undefined,
    };
  }

  return undefined;
}
