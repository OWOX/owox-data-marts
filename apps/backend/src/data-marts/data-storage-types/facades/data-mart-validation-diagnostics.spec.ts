jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));

import { Logger } from '@nestjs/common';
import { inspect } from 'node:util';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { AthenaDataMartValidator } from '../athena/services/athena-datamart.validator';
import { AthenaQueryBuilder } from '../athena/services/athena-query.builder';
import { AthenaClauseRenderer } from '../athena/services/athena-clause-renderer';
import { BigQueryDataMartValidator } from '../bigquery/services/bigquery-datamart.validator';
import { BigQueryQueryBuilder } from '../bigquery/services/bigquery-query.builder';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';
import { LegacyBigQueryDataMartValidator } from '../bigquery/services/legacy/legacy-bigquery-datamart.validator';
import { LegacyBigQueryQueryBuilder } from '../bigquery/services/legacy/legacy-bigquery-query.builder';
import { DatabricksDataMartValidator } from '../databricks/services/databricks-datamart.validator';
import { DatabricksQueryBuilder } from '../databricks/services/databricks-query.builder';
import { DatabricksClauseRenderer } from '../databricks/services/databricks-clause-renderer';
import { RedshiftDataMartValidator } from '../redshift/services/redshift-datamart.validator';
import { RedshiftQueryBuilder } from '../redshift/services/redshift-query.builder';
import { RedshiftClauseRenderer } from '../redshift/services/redshift-clause-renderer';
import { SnowflakeDataMartValidator } from '../snowflake/services/snowflake-datamart.validator';
import { SnowflakeQueryBuilder } from '../snowflake/services/snowflake-query.builder';
import { SnowflakeClauseRenderer } from '../snowflake/services/snowflake-clause-renderer';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartDefinitionValidatorFacade } from './data-mart-definition-validator-facade.service';

const secret = 'validation-private-credential';
const query = "SELECT 'validation-private-sql'";
const bigQueryCredentials = {
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: secret,
  private_key: `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----\n`,
  client_email: 'test@example.com',
  client_id: 'client-id',
  client_x509_cert_url: 'https://example.com/cert',
};
const awsCredentials = { accessKeyId: 'access-key', secretAccessKey: secret };

function createHarness(type: DataStorageType) {
  const adapter = {
    executeDryRunQuery: jest.fn(),
    destroy: jest.fn().mockResolvedValue(undefined),
  };
  const factory = { create: jest.fn().mockReturnValue(adapter) } as never;
  const bigQueryRenderer = new BigQueryClauseRenderer();
  const validators = [
    new BigQueryDataMartValidator(factory, new BigQueryQueryBuilder(bigQueryRenderer)),
    new LegacyBigQueryDataMartValidator(
      factory,
      new LegacyBigQueryQueryBuilder(
        { prepare: jest.fn().mockResolvedValue(query) } as never,
        bigQueryRenderer
      )
    ),
    new AthenaDataMartValidator(factory, new AthenaQueryBuilder(new AthenaClauseRenderer())),
    new SnowflakeDataMartValidator(
      factory,
      new SnowflakeQueryBuilder(new SnowflakeClauseRenderer())
    ),
    new DatabricksDataMartValidator(
      factory,
      new DatabricksQueryBuilder(new DatabricksClauseRenderer())
    ),
    new RedshiftDataMartValidator(factory, new RedshiftQueryBuilder(new RedshiftClauseRenderer())),
  ];
  const storageInputs = {
    [DataStorageType.GOOGLE_BIGQUERY]: {
      config: { projectId: 'test-project', location: 'US' },
      credentials: bigQueryCredentials,
    },
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: {
      config: { projectId: 'test-project', location: 'US' },
      credentials: bigQueryCredentials,
    },
    [DataStorageType.AWS_ATHENA]: {
      config: { region: 'us-east-1', outputBucket: 'test-bucket' },
      credentials: awsCredentials,
    },
    [DataStorageType.SNOWFLAKE]: {
      config: { account: 'test-account', warehouse: 'test-warehouse' },
      credentials: { authMethod: 'PASSWORD', username: 'test-user', password: secret },
    },
    [DataStorageType.DATABRICKS]: {
      config: { host: 'test-host', httpPath: '/test' },
      credentials: { authMethod: 'PERSONAL_ACCESS_TOKEN', token: secret },
    },
    [DataStorageType.AWS_REDSHIFT]: {
      config: {
        connectionType: 'SERVERLESS',
        region: 'us-east-1',
        database: 'test-db',
        workgroupName: 'test-workgroup',
      },
      credentials: awsCredentials,
    },
  };
  const { config, credentials } = storageInputs[type];
  const facade = new DataMartDefinitionValidatorFacade(new TypeResolver(validators), {
    resolve: jest.fn().mockResolvedValue(credentials),
  } as never);
  const dataMart = {
    definition: { sqlQuery: query },
    storage: { type, config, credentialId: 'credential-id' },
  };
  return { adapter, facade, dataMart };
}

describe('Data Mart validation provider diagnostics', () => {
  let logs: jest.SpyInstance[];

  beforeEach(() => {
    logs = (['log', 'debug', 'warn', 'error', 'verbose', 'fatal'] as const).map(method =>
      jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined)
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const expectSafeLogs = () => {
    const logged = inspect(
      logs.flatMap(log => log.mock.calls),
      { depth: null }
    );
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('validation-private-sql');
    expect(logged).not.toContain('validation-private-provider-error');
    expect(logged).not.toContain('validation-private-metadata');
  };

  it.each(Object.values(DataStorageType))(
    '%s preserves failure results without logging raw provider errors',
    async type => {
      const { adapter, facade, dataMart } = createHarness(type);
      const providerError = Object.assign(new Error('validation-private-provider-error'), {
        query,
        metadata: 'validation-private-metadata',
        credentials: { token: secret },
      });
      adapter.executeDryRunQuery.mockRejectedValue(providerError);

      const result = await facade.validate(dataMart as never);

      expect(adapter.executeDryRunQuery).toHaveBeenCalledWith(
        expect.stringContaining('validation-private-sql'),
        ...(type === DataStorageType.AWS_ATHENA ? ['test-bucket'] : [])
      );
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe(
        type === DataStorageType.AWS_REDSHIFT
          ? 'Data mart validation failed: Invalid query or database error'
          : providerError.message
      );
      expectSafeLogs();
    }
  );

  it('preserves a Databricks explain failure without logging its error payload', async () => {
    const { adapter, facade, dataMart } = createHarness(DataStorageType.DATABRICKS);
    const error = `${secret}: ${query}: validation-private-metadata`;
    adapter.executeDryRunQuery.mockResolvedValue({ isValid: false, error });

    const result = await facade.validate(dataMart as never);

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe(error);
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
    expectSafeLogs();
  });

  it('does not log Snowflake explain statistics containing provider payloads', async () => {
    const { adapter, facade, dataMart } = createHarness(DataStorageType.SNOWFLAKE);
    adapter.executeDryRunQuery.mockResolvedValue({
      GlobalStats: {
        partitionsTotal: { token: secret },
        partitionsAssigned: query,
        bytesAssigned: 'validation-private-metadata',
      },
    });

    const result = await facade.validate(dataMart as never);

    expect(result.valid).toBe(true);
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
    expectSafeLogs();
  });
});
