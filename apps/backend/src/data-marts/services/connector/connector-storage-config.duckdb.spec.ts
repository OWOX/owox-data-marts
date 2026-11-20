// connector-storage-config.duckdb.spec.ts
import { ConnectorStorageConfigService } from './connector-storage-config.service';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';

describe('ConnectorStorageConfigService DuckDB', () => {
  it('emits a DuckDB StorageConfigDto with the SP-A keys and the resolved path', async () => {
    const credsResolver = {
      resolve: async () => ({ databasePath: '/data/duck/st-9.duckdb' }),
    } as any;
    const service = new ConnectorStorageConfigService(
      credsResolver,
      /* googleOAuthConfig */ {} as any
    );
    const dataMart = {
      id: 'dm1',
      projectId: 'p1',
      storage: { id: 'st-9', type: DataStorageType.DUCKDB, config: {} },
      definition: {
        connector: {
          storage: { fullyQualifiedName: 'analytics.orders' },
          source: { node: 'observations' },
        },
      },
    } as any;
    const dto = await service.buildStorageConfig(dataMart);
    // `Core.StorageConfigDto` (packages/connectors) wraps every primitive config value as
    // `{ value: <primitive> }` — this is how the connector-runner's `context.getParameter(name)`
    // is consumed everywhere (see DuckDBStorage.js, AwsAthenaStorage.js, AbstractStorage.js),
    // so assertions unwrap `.value` to match real runtime behavior.
    expect(dto.name).toBe('DuckDB');
    expect(dto.config.DatabasePath.value).toBe('/data/duck/st-9.duckdb');
    expect(dto.config.DestinationSchemaName.value).toBe('analytics');
    // Must be "...Override" — AbstractSource.getDestinationName() reads this exact key
    // (same "<node> <table>" format BigQuery/Athena/Snowflake/Redshift/Databricks all use)
    // before AbstractConnector.getStorageForNode() writes the resolved name into
    // DestinationTableName. Proven against the real runtime in duckdb-storage-load.e2e-spec.ts.
    expect(dto.config.DestinationTableNameOverride.value).toBe('observations orders');
    expect(dto.config.MaxBufferSize.value).toBe(1000);
  });
});
