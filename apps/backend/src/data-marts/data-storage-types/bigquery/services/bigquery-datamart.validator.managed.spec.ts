import { DataMartValidationCode } from '../../interfaces/data-mart-validator.interface';
import { BigQueryDataMartValidator } from './bigquery-datamart.validator';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import type { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import type { DataStorageConfig } from '../../data-storage-config.type';
import type { DataStorageCredentials } from '../../data-storage-credentials.type';

describe('BigQueryDataMartValidator (managed)', () => {
  const credentials = {
    type: 'bigquery_managed',
    authClient: {},
    datasetId: 'owox_abc',
  } as unknown as DataStorageCredentials;
  const config = { projectId: 'proj-abc', location: 'US' } as unknown as DataStorageConfig;
  const definition = {
    type: DataMartDefinitionType.SQL,
    sqlQuery: 'SELECT 1',
  } as unknown as DataMartDefinition;
  const executeDryRunQuery = jest.fn();
  const validator = new BigQueryDataMartValidator(
    { create: () => ({ executeDryRunQuery }) } as never,
    { buildQuery: () => Promise.resolve('SELECT 1') } as never
  );

  it('fails validation for a non-SELECT definition on a managed storage', async () => {
    executeDryRunQuery.mockResolvedValue({ statementType: 'SCRIPT' });

    const result = await validator.validate(definition, config, credentials);

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain('SELECT queries only');
    expect(result.code).toBe(DataMartValidationCode.STATEMENT_NOT_ALLOWED);
  });

  it('passes a SELECT definition', async () => {
    executeDryRunQuery.mockResolvedValue({ statementType: 'SELECT' });

    const result = await validator.validate(definition, config, credentials);

    expect(result.valid).toBe(true);
  });

  const connectorDefinition = (fullyQualifiedName: string) =>
    ({
      connector: {
        source: { name: 'TestSource', configuration: [{}], node: 'ads', fields: ['id'] },
        storage: { fullyQualifiedName },
      },
    }) as unknown as DataMartDefinition;

  // A project-qualified name fails the shared identifier check before this one.
  it('refuses a connector aimed at another dataset', async () => {
    const result = await validator.validate(
      connectorDefinition('other.table'),
      config,
      credentials
    );

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe('Connectors on an OWOX Storage write into dataset owox_abc.');
  });

  it('passes a connector aimed at the storage dataset', async () => {
    const result = await validator.validate(
      connectorDefinition('owox_abc.table'),
      config,
      credentials
    );

    expect(result.valid).toBe(true);
  });
});
