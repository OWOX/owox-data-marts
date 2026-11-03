import { describe, it, expect } from 'vitest';
import { DataStorageType } from '../../../../data-storage';
import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage';
import { RedshiftConnectionType } from '../../../../data-storage/shared/model/types/data-storage-config';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { getSourceFlowParams, getStorageFlowParams } from './connector-flow.utils';

const storage = (type: DataStorageType, config: Record<string, unknown>) =>
  ({
    id: 's1',
    title: 'Storage',
    type,
    config,
    createdAt: new Date(),
    modifiedAt: new Date(),
  }) as unknown as DataStorage;

const labels = (params: { label: string }[]) => params.map(p => p.label);

describe('getStorageFlowParams', () => {
  it('shows BigQuery dataset and table, copied with the project prefix', () => {
    const result = getStorageFlowParams(
      storage(DataStorageType.GOOGLE_BIGQUERY, { projectId: 'proj', location: 'US' }),
      'raw.fb_insights'
    );

    expect(result.primary).toMatchObject([
      { label: 'Dataset', value: 'raw', copyValue: 'proj.raw' },
      { label: 'Table', value: 'fb_insights', copyValue: 'proj.raw.fb_insights' },
    ]);
    expect(result.primary.every(p => p.href)).toBe(true);
    expect(result.secondary).toEqual([]);
    expect(result.hint).toMatch(/dataset and table/);
  });

  it('shows Athena database and table', () => {
    const result = getStorageFlowParams(
      storage(DataStorageType.AWS_ATHENA, { region: 'eu-west-1', outputBucket: 'b' }),
      'db.events'
    );

    expect(result.primary).toMatchObject([
      { label: 'Database', value: 'db', copyValue: 'db' },
      { label: 'Table', value: 'events', copyValue: 'db.events' },
    ]);
    expect(result.secondary).toEqual([]);
  });

  it('shows Snowflake schema and table unquoted, keeps the database under "more", copies as stored', () => {
    const result = getStorageFlowParams(
      storage(DataStorageType.SNOWFLAKE, { account: 'acc', warehouse: 'wh' }),
      'DB."My Schema"."Events"'
    );

    expect(result.primary).toMatchObject([
      { label: 'Schema', value: 'My Schema', copyValue: 'DB."My Schema"' },
      { label: 'Table', value: 'Events', copyValue: 'DB."My Schema"."Events"' },
    ]);
    expect(result.secondary).toMatchObject([{ label: 'Database', value: 'DB', copyValue: 'DB' }]);
  });

  it('shows Redshift schema and table, with region, database and workgroup under "more"', () => {
    const result = getStorageFlowParams(
      storage(DataStorageType.AWS_REDSHIFT, {
        connectionType: RedshiftConnectionType.SERVERLESS,
        region: 'eu-central-1',
        database: 'analytics',
        workgroupName: 'wg',
      }),
      'analytics.ads.daily'
    );

    expect(result.primary).toMatchObject([
      { label: 'Schema', value: 'ads', copyValue: 'analytics.ads' },
      { label: 'Table', value: 'daily', copyValue: 'analytics.ads.daily' },
    ]);
    expect(result.secondary).toMatchObject([
      { label: 'Region', value: 'eu-central-1' },
      { label: 'Database', value: 'analytics', copyValue: 'analytics' },
      { label: 'Workgroup', value: 'wg' },
    ]);
    expect(result.secondary[0].copyValue).toBeUndefined();
  });

  it('shows the Redshift cluster for a provisioned connection and a two-part name', () => {
    const result = getStorageFlowParams(
      storage(DataStorageType.AWS_REDSHIFT, {
        connectionType: RedshiftConnectionType.PROVISIONED,
        region: 'us-east-1',
        database: 'dev',
        clusterIdentifier: 'cl-1',
      }),
      'ads.daily'
    );

    expect(result.primary).toMatchObject([
      { label: 'Schema', value: 'ads', copyValue: 'ads' },
      { label: 'Table', value: 'daily', copyValue: 'ads.daily' },
    ]);
    expect(labels(result.secondary)).toEqual(['Region', 'Database', 'Cluster']);
  });

  it('falls back to the default Databricks catalog for a two-part name', () => {
    const result = getStorageFlowParams(
      storage(DataStorageType.DATABRICKS, { host: 'h.cloud', httpPath: '/p' }),
      'ads.daily'
    );

    expect(result.primary).toMatchObject([
      { label: 'Schema', value: 'ads', copyValue: 'ads' },
      { label: 'Table', value: 'daily', copyValue: 'ads.daily' },
    ]);
    expect(result.secondary).toMatchObject([{ label: 'Catalog', value: 'hive_metastore' }]);
  });

  it('uses the given Databricks catalog for a three-part name', () => {
    const result = getStorageFlowParams(
      storage(DataStorageType.DATABRICKS, { host: 'h.cloud', httpPath: '/p' }),
      'main.ads.daily'
    );

    expect(result.primary[0].copyValue).toBe('main.ads');
    expect(result.secondary).toMatchObject([{ label: 'Catalog', value: 'main' }]);
  });

  it('shows the whole name as the table for an unsupported storage type', () => {
    const result = getStorageFlowParams(storage(DataStorageType.AZURE_SYNAPSE, {}), 'dbo.events');

    expect(result.primary).toEqual([
      { label: 'Table', value: 'dbo.events', copyValue: 'dbo.events' },
    ]);
    expect(result.hint).toBeNull();
  });
});

describe('getSourceFlowParams', () => {
  const definition = (
    name: string,
    node: string,
    configuration: Record<string, unknown>[] = [{}]
  ): ConnectorDefinitionConfig => ({
    connector: {
      source: { name, node, configuration, fields: ['a'] },
      storage: { fullyQualifiedName: 'a.b' },
    },
  });

  it('shows the connector node', () => {
    expect(getSourceFlowParams(definition('FacebookMarketing', 'insights'), 0)).toEqual([
      { label: 'Data', value: 'insights' },
    ]);
  });

  it('says when no node is selected', () => {
    expect(getSourceFlowParams(definition('FacebookMarketing', ''), 0)).toEqual([
      { label: 'Data', value: 'No node selected' },
    ]);
  });

  it('shows the Google Sheets sheet name linked to its spreadsheet', () => {
    const params = getSourceFlowParams(
      definition('GoogleSheets', 'sheet', [{ SheetName: ' Leads ', SpreadsheetId: 'abc' }]),
      0
    );

    expect(params).toHaveLength(1);
    expect(params[0]).toMatchObject({ label: 'Sheet', value: 'Leads' });
    expect(params[0].href).toContain('abc');
  });

  it('falls back to the node for Google Sheets without a sheet name', () => {
    expect(getSourceFlowParams(definition('GoogleSheets', 'sheet'), 0)).toEqual([
      { label: 'Data', value: 'sheet' },
    ]);
  });
});
