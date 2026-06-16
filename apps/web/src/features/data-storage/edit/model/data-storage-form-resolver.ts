import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { COPY_SOURCE_CREDENTIAL_PLACEHOLDER } from '../../../../shared/utils/credential-identity-utils';
import { dataStorageSchema, type DataStorageFormData, DataStorageType } from '../../shared';
import { SnowflakeAuthMethod, DatabricksAuthMethod } from '../../shared/model/types/credentials';

/**
 * Schema-satisfying credentials for the "Copy From" flow. The values are never
 * sent to the server: handleSubmit strips credentials from the payload when a
 * copy source is selected and the server copies them via sourceStorageId.
 */
function buildCopySourcePlaceholderCredentials(
  type: DataStorageType | undefined
): DataStorageFormData['credentials'] | undefined {
  switch (type) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return { credentialId: COPY_SOURCE_CREDENTIAL_PLACEHOLDER };
    case DataStorageType.AWS_ATHENA:
    case DataStorageType.AWS_REDSHIFT:
      return {
        accessKeyId: COPY_SOURCE_CREDENTIAL_PLACEHOLDER,
        secretAccessKey: COPY_SOURCE_CREDENTIAL_PLACEHOLDER,
      };
    case DataStorageType.SNOWFLAKE:
      return {
        authMethod: SnowflakeAuthMethod.PASSWORD,
        username: COPY_SOURCE_CREDENTIAL_PLACEHOLDER,
        password: COPY_SOURCE_CREDENTIAL_PLACEHOLDER,
      };
    case DataStorageType.DATABRICKS:
      return {
        authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
        token: COPY_SOURCE_CREDENTIAL_PLACEHOLDER,
      };
    case DataStorageType.AZURE_SYNAPSE:
      // No Zod schema yet — credentials aren't validated, so no placeholder needed.
      return undefined;
    case undefined:
      return undefined;
    default: {
      // If TypeScript errors here, a new DataStorageType was added without a case above.
      const _exhaustive: never = type;
      void _exhaustive;
      return undefined;
    }
  }
}

/**
 * Form resolver for the Data Storage form.
 *
 * @param isCopySourceSelected returns true while the user copies credentials
 * from another storage ("Copy From"). In that state the credential inputs are
 * hidden and the real credentials are copied server-side via sourceStorageId,
 * so credential validation must be bypassed.
 */
export function createDataStorageFormResolver(
  isCopySourceSelected: () => boolean
): Resolver<DataStorageFormData> {
  const baseResolver = zodResolver(dataStorageSchema);
  return async (values, context, options) => {
    const copying = isCopySourceSelected();
    const placeholderCredentials = copying
      ? buildCopySourcePlaceholderCredentials(values.type)
      : undefined;
    const effectiveValues = placeholderCredentials
      ? ({ ...values, credentials: placeholderCredentials } as DataStorageFormData)
      : values;
    const result = await baseResolver(effectiveValues, context, options);
    if (copying) {
      const { credentials: _stripped, ...rest } = result.values as DataStorageFormData & {
        credentials?: unknown;
      };
      void _stripped;
      return { ...result, values: rest as unknown as DataStorageFormData };
    }
    return result;
  };
}
