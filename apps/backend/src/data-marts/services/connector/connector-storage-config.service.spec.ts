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
      getClientById: jest.fn((id: string) =>
        id === 'client-id' ? { clientId: 'client-id', clientSecret: 'client-secret' } : null
      ),
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

  it('gives the BigQuery connector the dataset and the table of a dataset.table path', async () => {
    const { service, storageCredentialsResolver } = createService();
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue({
      type: 'service_account',
    });

    const result = await service.buildStorageConfig(baseDataMart);

    expect(result.config.DestinationDatasetID.value).toBe('gcp-project.dataset');
    expect(result.config.DestinationDatasetName.value).toBe('dataset');
    expect(result.config.DestinationTableNameOverride.value).toBe('test_node table');
  });

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'Expected: dataset.table, without the project'],
    [DataStorageType.AWS_ATHENA, 'Expected: database.table, without the catalog'],
  ])('rejects a three-part %s connector path before the run', async (type, message) => {
    const { service, storageCredentialsResolver } = createService();
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue({});
    const dm = {
      ...baseDataMart,
      definition: {
        connector: {
          ...(baseDataMart.definition as unknown as { connector: Record<string, unknown> })
            .connector,
          storage: { fullyQualifiedName: 'gcp-project.dataset.table' },
        },
      },
      storage: { type, config: { projectId: 'gcp-project', outputBucket: 's3://bucket' } },
    } as unknown as DataMart;

    await expect(service.buildStorageConfig(dm)).rejects.toThrow(message);
  });

  it('builds BigQuery storage config with OAuth credentials', async () => {
    const { service, storageCredentialsResolver } = createService();
    const credentials = {
      type: 'bigquery_oauth',
      oauthClientId: 'client-id',
      oauth2Client: {
        getAccessToken: jest.fn().mockResolvedValue({ token: 'access-token' }),
        credentials: { refresh_token: 'refresh-token', expiry_date: 1234567890 },
      },
    };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(baseDataMart);
    expect(result).toBeDefined();
    expect(result.config.OAuthClientId.value).toBe('client-id');
    expect(result.config.OAuthClientSecret.value).toBe('client-secret');
    // The connector's own OAuth2Client rebuilds credentials from these values on
    // every query for the lifetime of a run (which can span hours during a
    // backfill); without expiry_date it can never tell the access token has
    // gone stale and silently keeps resending it until BigQuery rejects it.
    expect(result.config.OAuthAccessTokenExpiry.value).toBe(1234567890);
  });

  it('fails without naming a secret when the OAuth client is no longer configured', async () => {
    const { service, storageCredentialsResolver } = createService();
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue({
      type: 'bigquery_oauth',
      oauthClientId: 'gone',
      oauth2Client: {
        getAccessToken: jest.fn().mockResolvedValue({ token: 'access-token' }),
        credentials: {},
      },
    });

    await expect(service.buildStorageConfig(baseDataMart)).rejects.toThrow(
      'Google OAuth client of the Storage credential is not configured'
    );
  });

  it('passes null OAuthAccessTokenExpiry when the OAuth token has no known expiry', async () => {
    const { service, storageCredentialsResolver } = createService();
    const credentials = {
      type: 'bigquery_oauth',
      oauthClientId: 'client-id',
      oauth2Client: {
        getAccessToken: jest.fn().mockResolvedValue({ token: 'access-token' }),
        credentials: { refresh_token: 'refresh-token' },
      },
    };
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue(credentials);

    const result = await service.buildStorageConfig(baseDataMart);

    // StorageConfigDto only wraps non-object values as { value }; since
    // typeof null === 'object' in JS, a null expiry stays unwrapped here.
    expect(result.config.OAuthAccessTokenExpiry).toBeNull();
  });

  it.each([undefined, null, ''])(
    'sends AUTODETECT when the BigQuery Storage location is %j',
    async location => {
      const { service, storageCredentialsResolver } = createService();
      (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue({
        type: 'service_account',
      });

      const result = await service.buildStorageConfig({
        ...baseDataMart,
        storage: { ...baseDataMart.storage, config: { projectId: 'gcp-project', location } },
      } as unknown as DataMart);

      expect(result.config.DestinationLocation).toEqual({ value: 'AUTODETECT' });
    }
  );

  it('keeps an explicit BigQuery Storage location', async () => {
    const { service, storageCredentialsResolver } = createService();
    (storageCredentialsResolver.resolve as jest.Mock).mockResolvedValue({
      type: 'service_account',
    });

    const result = await service.buildStorageConfig(baseDataMart);

    expect(result.config.DestinationLocation).toEqual({ value: 'US' });
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
