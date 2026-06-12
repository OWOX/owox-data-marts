import { describe, it, expect } from 'vitest';
import { DataStorageType, type DataStorageFormData } from '../../shared';
import { RedshiftConnectionType } from '../../shared/model/types/credentials';
import { createDataStorageFormResolver } from './data-storage-form-resolver';

const resolverOptions = {
  fields: {},
  shouldUseNativeValidation: false,
} as const;

// Only types present in the dataStorageSchema discriminated union
// (e.g. AZURE_SYNAPSE is "coming soon" and has no schema yet).
const validConfigByType = {
  [DataStorageType.GOOGLE_BIGQUERY]: { projectId: 'my-project', location: 'US' },
  [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: { projectId: 'my-project', location: 'US' },
  [DataStorageType.AWS_ATHENA]: { region: 'us-east-1', outputBucket: 'my-bucket' },
  [DataStorageType.SNOWFLAKE]: { account: 'my-account', warehouse: 'my-warehouse' },
  [DataStorageType.AWS_REDSHIFT]: {
    connectionType: RedshiftConnectionType.SERVERLESS,
    region: 'us-east-1',
    database: 'my-db',
    workgroupName: 'my-workgroup',
  },
  [DataStorageType.DATABRICKS]: { host: 'my-host', httpPath: '/sql/1.0' },
};

type SchemaBackedType = keyof typeof validConfigByType;

function buildValues(type: SchemaBackedType) {
  // The resolver receives raw form values at runtime, which may not yet
  // satisfy the schema (that is exactly what it validates).
  return {
    title: 'My storage',
    type,
    credentials: {},
    config: validConfigByType[type],
  } as unknown as DataStorageFormData;
}

describe('createDataStorageFormResolver', () => {
  it.each(Object.keys(validConfigByType) as SchemaBackedType[])(
    'passes validation for %s with empty credentials while copying from another storage',
    async type => {
      const resolver = createDataStorageFormResolver(() => true);

      const result = await resolver(buildValues(type), undefined, resolverOptions);

      expect(result.errors).toEqual({});
    }
  );

  it('keeps requiring credentials when no copy source is selected', async () => {
    const resolver = createDataStorageFormResolver(() => false);

    const result = await resolver(
      buildValues(DataStorageType.AWS_REDSHIFT),
      undefined,
      resolverOptions
    );

    expect(result.errors).toHaveProperty('credentials');
  });

  it('still reports errors on non-credential fields while copying', async () => {
    const resolver = createDataStorageFormResolver(() => true);

    const result = await resolver(
      { ...buildValues(DataStorageType.AWS_REDSHIFT), title: '' },
      undefined,
      resolverOptions
    );

    expect(result.errors).toHaveProperty('title');
    expect(result.errors).not.toHaveProperty('credentials');
  });
});
