// connector-storage-config.service.spec.ts
import { ConnectorStorageConfigService } from './connector-storage-config.service';
import { DataStorageCredentialsResolver } from '../../data-storage-types/data-storage-credentials-resolver.service';
import { GoogleOAuthConfigService } from '../google-oauth/google-oauth-config.service';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { DataMart } from '../../entities/data-mart.entity';
import { RedshiftConnectionType } from '../../data-storage-types/redshift/enums/redshift-connection-type.enum';

describe('ConnectorStorageConfigService', () => {
  const createService = () => {
    const storageCredentialsResolver = {
      resolve: jest.fn(),
    } as unknown as DataStorageCredentialsResolver;

    const googleOAuthConfigService = {
      getStorageClientId: jest.fn().mockReturnValue('client-id'),
      getStorageClientSecret: jest.fn().mockReturnValue('client-secret'),
    } as unknown as GoogleOAuthConfigService;

    const service = new ConnectorStorageConfigService(
      storageCredentialsResolver,
      googleOAuthConfigService
    );

    return { service, storageCredentialsResolver, googleOAuthConfigService };
  };

  const baseDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    definition: {
      connector: {
        source: { name: 'TestConnector', node: 'test_node', fields: ['field1'], configuration: [] },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    },
    storage: {
      type: DataStorageType.GOOGLE_BIGQUERY,
      config: { projectId: 'gcp-project', location: 'US' },
    },
  } as unknown as DataMart;

  it('builds BigQuery storage config with service account', async () => {
    const { service, storageCredentialsResolver } = createService();
    const credentials = { type: 'service_account', project_id: 'gcp-project' };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(baseDataMart);

    expect(result).toBeDefined();
    const config = result.toObject ? result.toObject() : result;
    expect(config).toBeDefined();
  });

  it('builds BigQuery storage config with OAuth credentials', async () => {
    const { service, storageCredentialsResolver } = createService();
    const credentials = {
      type: 'bigquery_oauth',
      oauth2Client: {
        getAccessToken: jest.fn().mockResolvedValue({ token: 'access-token' }),
        credentials: { refresh_token: 'refresh-token' },
      },
    };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(baseDataMart);
    expect(result).toBeDefined();
  });

  it('builds Athena storage config', async () => {
    const { service, storageCredentialsResolver } = createService();
    const dm = {
      ...baseDataMart,
      storage: {
        type: DataStorageType.AWS_ATHENA,
        config: { region: 'us-east-1', outputBucket: 's3://my-bucket/' },
      },
    } as unknown as DataMart;
    const credentials = { accessKeyId: 'key', secretAccessKey: 'secret' };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(dm);
    expect(result).toBeDefined();
  });

  it('builds Snowflake storage config with password auth', async () => {
    const { service, storageCredentialsResolver } = createService();
    const dm = {
      ...baseDataMart,
      definition: {
        connector: {
          ...(baseDataMart.definition as unknown as { connector: Record<string, unknown> })
            .connector,
          storage: { fullyQualifiedName: 'DB.SCHEMA.TABLE' },
        },
      },
      storage: {
        type: DataStorageType.SNOWFLAKE,
        config: { account: 'acc', warehouse: 'wh', role: 'role' },
      },
    } as unknown as DataMart;
    const credentials = { username: 'user', authMethod: 'PASSWORD', password: 'pass' };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(dm);
    expect(result).toBeDefined();
  });

  it('builds Snowflake storage config with key-pair auth', async () => {
    const { service, storageCredentialsResolver } = createService();
    const dm = {
      ...baseDataMart,
      definition: {
        connector: {
          ...(baseDataMart.definition as unknown as { connector: Record<string, unknown> })
            .connector,
          storage: { fullyQualifiedName: 'DB.SCHEMA.TABLE' },
        },
      },
      storage: {
        type: DataStorageType.SNOWFLAKE,
        config: { account: 'acc', warehouse: 'wh', role: '' },
      },
    } as unknown as DataMart;
    const credentials = {
      username: 'user',
      authMethod: 'KEY_PAIR',
      privateKey: 'pk',
      privateKeyPassphrase: 'pkp',
    };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(dm);
    expect(result).toBeDefined();
  });

  it('builds Redshift serverless storage config', async () => {
    const { service, storageCredentialsResolver } = createService();
    const dm = {
      ...baseDataMart,
      definition: {
        connector: {
          ...(baseDataMart.definition as unknown as { connector: Record<string, unknown> })
            .connector,
          storage: { fullyQualifiedName: '"schema"."table"' },
        },
      },
      storage: {
        type: DataStorageType.AWS_REDSHIFT,
        config: {
          region: 'us-east-1',
          database: 'db',
          connectionType: RedshiftConnectionType.SERVERLESS,
          workgroupName: 'wg',
        },
      },
    } as unknown as DataMart;
    const credentials = { accessKeyId: 'key', secretAccessKey: 'secret' };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(dm);
    expect(result).toBeDefined();
  });

  it('builds Redshift provisioned storage config', async () => {
    const { service, storageCredentialsResolver } = createService();
    const dm = {
      ...baseDataMart,
      definition: {
        connector: {
          ...(baseDataMart.definition as unknown as { connector: Record<string, unknown> })
            .connector,
          storage: { fullyQualifiedName: 'db."schema"."table"' },
        },
      },
      storage: {
        type: DataStorageType.AWS_REDSHIFT,
        config: {
          region: 'us-east-1',
          database: 'db',
          connectionType: RedshiftConnectionType.PROVISIONED,
          clusterIdentifier: 'cluster',
        },
      },
    } as unknown as DataMart;
    const credentials = { accessKeyId: 'key', secretAccessKey: 'secret' };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(dm);
    expect(result).toBeDefined();
  });

  it('builds Databricks storage config', async () => {
    const { service, storageCredentialsResolver } = createService();
    const dm = {
      ...baseDataMart,
      definition: {
        connector: {
          ...(baseDataMart.definition as unknown as { connector: Record<string, unknown> })
            .connector,
          storage: { fullyQualifiedName: 'catalog.schema.table' },
        },
      },
      storage: {
        type: DataStorageType.DATABRICKS,
        config: { host: 'host', httpPath: '/path' },
      },
    } as unknown as DataMart;
    const credentials = { token: 'tok' };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(dm);
    expect(result).toBeDefined();
  });

  it('throws on unsupported storage type', async () => {
    const { service, storageCredentialsResolver } = createService();
    const dm = {
      ...baseDataMart,
      storage: { type: 'UNKNOWN_TYPE', config: {} },
    } as unknown as DataMart;
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue({});

    await expect(service.buildStorageConfig(dm)).rejects.toThrow('Unsupported storage type');
  });
});
