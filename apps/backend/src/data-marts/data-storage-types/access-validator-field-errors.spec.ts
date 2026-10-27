import { Logger } from '@nestjs/common';
import { AthenaAccessValidator } from './athena/services/athena-access.validator';
import { BigQueryAccessValidator } from './bigquery/services/bigquery-access.validator';
import { DatabricksAccessValidator } from './databricks/services/databricks-access.validator';
import { isDatabricksWorkspaceHost } from './databricks/schemas/databricks-config.schema';
import { RedshiftAccessValidator } from './redshift/services/redshift-access.validator';
import { SnowflakeAccessValidator } from './snowflake/services/snowflake-access.validator';
import { RedshiftConnectionType } from './redshift/enums/redshift-connection-type.enum';
import type { DataStorageAccessValidator } from './interfaces/data-storage-access-validator.interface';
import type { DataStorageConfig } from './data-storage-config.type';
import type { DataStorageCredentials } from './data-storage-credentials.type';

/**
 * The storage form highlights an input only from `reason.fieldErrors`, scoped by request path.
 * Pins that every storage's validator reports schema failures that way, under the right scope:
 * both branches return before any adapter is created, so no warehouse is contacted.
 */
const noAdapterFactory = {} as never;

const cases: [string, DataStorageAccessValidator, Record<string, unknown>][] = [
  [
    'AWS Athena',
    new AthenaAccessValidator(noAdapterFactory),
    { region: 'us-east-1', outputBucket: 'my-bucket' },
  ],
  ['Google BigQuery', new BigQueryAccessValidator(), { projectId: 'my-project', location: 'US' }],
  [
    'Databricks',
    new DatabricksAccessValidator(noAdapterFactory),
    { host: 'example.cloud.databricks.com', httpPath: '/sql/1.0/warehouses/abc' },
  ],
  [
    'AWS Redshift',
    new RedshiftAccessValidator(noAdapterFactory),
    {
      connectionType: RedshiftConnectionType.SERVERLESS,
      region: 'us-east-1',
      database: 'dev',
      workgroupName: 'default',
    },
  ],
  ['Snowflake', new SnowflakeAccessValidator(), { account: 'xy12345', warehouse: 'COMPUTE_WH' }],
];

const noCredentials = {} as DataStorageCredentials;

describe.each(cases)('%s access validator', (_name, validator, validConfig) => {
  // The validators log each schema failure with its ZodError.
  beforeEach(() => {
    for (const level of ['log', 'warn'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it('names each rejected config value under config.*', async () => {
    const result = await validator.validate({} as DataStorageConfig, noCredentials);

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/^Invalid config — /);
    const fieldErrors = (result.reason as { fieldErrors: { field: string }[] }).fieldErrors;
    expect(fieldErrors.length).toBeGreaterThan(0);
    for (const { field } of fieldErrors) expect(field).toMatch(/^config\.\w+/);
  });

  it('names each rejected credential under credentials.*', async () => {
    const result = await validator.validate(validConfig as DataStorageConfig, noCredentials);

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/^Invalid credentials — /);
    const fieldErrors = (result.reason as { fieldErrors: { field: string }[] }).fieldErrors;
    expect(fieldErrors.length).toBeGreaterThan(0);
    for (const { field } of fieldErrors) expect(field).toMatch(/^credentials\.\w+/);
  });
});

describe('Databricks workspace host', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it.each([
    'dbc-12345678-90ab.cloud.databricks.com',
    'Adb-1234567890123456.7.AzureDatabricks.net',
    '1234567890123456.7.gcp.databricks.com',
    'agency.cloud.databricks.us',
    'unit.cloud.databricks.mil',
    'adb-1.2.databricks.azure.us',
    'adb-1.2.databricks.azure.cn',
  ])('accepts %s', host => {
    expect(isDatabricksWorkspaceHost(host)).toBe(true);
  });

  it.each([
    'collector.vendor.example',
    'cloud.databricks.com',
    'workspace.cloud.databricks.com.vendor.example',
    'vendor.example/workspace.cloud.databricks.com',
    'vendor.example?workspace.cloud.databricks.com',
    'workspace.cloud.databricks.com:8443',
    'app-1.aws.databricksapps.com',
  ])('refuses %s before the token is sent anywhere', async host => {
    // The factory has no create(): reaching it would throw.
    const result = await new DatabricksAccessValidator(noAdapterFactory).validate(
      { host, httpPath: '/sql/1.0/warehouses/abc' } as DataStorageConfig,
      { token: 'dapi-token' } as DataStorageCredentials
    );

    expect(isDatabricksWorkspaceHost(host)).toBe(false);
    expect(result.valid).toBe(false);
    expect((result.reason as { fieldErrors: { field: string }[] }).fieldErrors).toEqual([
      expect.objectContaining({ field: 'config.host' }),
    ]);
  });
});
