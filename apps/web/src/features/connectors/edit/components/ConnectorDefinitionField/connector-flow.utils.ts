import { DataStorageType } from '../../../../data-storage';
import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage';
import { RedshiftConnectionType } from '../../../../data-storage/shared/model/types/data-storage-config';
import {
  getBigQueryDatasetUrl,
  getBigQueryTableUrl,
  getRedshiftQueryEditorUrl,
} from '../../../../data-storage/shared/utils/storage-url.utils';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { GOOGLE_SHEETS_CONNECTOR_NAME } from '../../../shared/utils/google-sheets-fields.utils';
import { spreadsheetUrlFrom } from '../../../../google-oauth';
import { unquoteIdentifier } from '../../utils/snowflake-identifier.utils';

/**
 * One labelled value shown on a data flow node, optionally linked to an external console.
 * `copyValue`, when set, is the qualified name a user pastes into SQL.
 */
export interface FlowParam {
  label: string;
  value: string;
  href?: string;
  copyValue?: string;
}

/**
 * What the Storage node of a connector configuration shows.
 *
 * `primary` holds the two most specific levels of the table path and is always visible;
 * `secondary` holds the broader, storage-level settings shown only on "more".
 * `hint` explains that the path is created on the first run.
 */
export interface StorageFlowParams {
  primary: FlowParam[];
  secondary: FlowParam[];
  hint: string | null;
}

/**
 * Splits the connector's target `fullyQualifiedName` into the params of the Storage node.
 * Each path level copies as the stored name up to that level, as is (quoted identifiers
 * included); BigQuery is prefixed with the project ID because the stored name omits it.
 */
export function getStorageFlowParams(
  dataStorage: DataStorage,
  fullyQualifiedName: string
): StorageFlowParams {
  const parts = fullyQualifiedName.split('.');
  // The stored name from its first part through the `level`-th one.
  const pathTo = (level: number) => parts.slice(0, level).join('.');

  switch (dataStorage.type) {
    case DataStorageType.GOOGLE_BIGQUERY: {
      const projectId = dataStorage.config.projectId;
      const [dataset, table] = parts;
      return {
        primary: [
          {
            label: 'Dataset',
            value: dataset,
            href: getBigQueryDatasetUrl(projectId, dataset),
            copyValue: `${projectId}.${pathTo(1)}`,
          },
          {
            label: 'Table',
            value: table,
            href: getBigQueryTableUrl(projectId, dataset, table),
            copyValue: `${projectId}.${pathTo(2)}`,
          },
        ],
        secondary: [],
        hint: "The dataset and table are automatically created during the first run of the data mart, if they don't already exist",
      };
    }
    case DataStorageType.AWS_ATHENA: {
      const [databaseName, table] = parts;
      const consoleLink = `https://console.aws.amazon.com/athena/home?region=${dataStorage.config.region}#/query-editor`;
      return {
        primary: [
          { label: 'Database', value: databaseName, href: consoleLink, copyValue: pathTo(1) },
          { label: 'Table', value: table, href: consoleLink, copyValue: pathTo(2) },
        ],
        secondary: [],
        hint: "The database and table are automatically created during the first run of the data mart, if they don't already exist",
      };
    }
    case DataStorageType.SNOWFLAKE: {
      const [database, schema, table] = parts;
      const consoleLink = `https://${dataStorage.config.account}.snowflakecomputing.com`;
      const databaseLink = `${consoleLink}/#/data/databases/${database}`;
      const schemaLink = `${databaseLink}/schemas/${schema}`;
      return {
        primary: [
          {
            label: 'Schema',
            value: unquoteIdentifier(schema),
            href: schemaLink,
            copyValue: pathTo(2),
          },
          {
            label: 'Table',
            value: unquoteIdentifier(table),
            href: `${schemaLink}/table/${table}`,
            copyValue: pathTo(3),
          },
        ],
        secondary: [
          { label: 'Database', value: database, href: databaseLink, copyValue: pathTo(1) },
        ],
        hint: "The database, schema and table are automatically created during the first run of the data mart, if they don't already exist",
      };
    }
    case DataStorageType.AWS_REDSHIFT: {
      const config = dataStorage.config;
      const hasDatabase = parts.length === 3;
      const [schema, table] = hasDatabase ? parts.slice(1) : parts;
      const consoleLink = getRedshiftQueryEditorUrl(config.region);
      const connection: FlowParam =
        config.connectionType === RedshiftConnectionType.SERVERLESS
          ? { label: 'Workgroup', value: config.workgroupName }
          : { label: 'Cluster', value: config.clusterIdentifier };
      return {
        primary: [
          {
            label: 'Schema',
            value: unquoteIdentifier(schema),
            href: consoleLink,
            copyValue: pathTo(hasDatabase ? 2 : 1),
          },
          {
            label: 'Table',
            value: unquoteIdentifier(table),
            href: consoleLink,
            copyValue: fullyQualifiedName,
          },
        ],
        secondary: [
          { label: 'Region', value: config.region },
          { label: 'Database', value: config.database, copyValue: config.database },
          connection,
        ],
        hint: "The schema and table are automatically created during the first run of the data mart, if they don't already exist",
      };
    }
    case DataStorageType.DATABRICKS: {
      // Two parts mean no catalog was given, so the default one is used.
      const hasCatalog = parts.length === 3;
      const [catalog, schema, table] = hasCatalog ? parts : ['hive_metastore', parts[0], parts[1]];
      const consoleLink = `https://${dataStorage.config.host}`;
      return {
        primary: [
          {
            label: 'Schema',
            value: schema,
            href: consoleLink,
            copyValue: pathTo(hasCatalog ? 2 : 1),
          },
          { label: 'Table', value: table, href: consoleLink, copyValue: fullyQualifiedName },
        ],
        secondary: [{ label: 'Catalog', value: catalog, href: consoleLink, copyValue: catalog }],
        hint: "The catalog, schema and table are automatically created during the first run of the data mart, if they don't already exist",
      };
    }
    default:
      return {
        primary: [{ label: 'Table', value: fullyQualifiedName, copyValue: fullyQualifiedName }],
        secondary: [],
        hint: null,
      };
  }
}

/**
 * The params of the Source node: the connector node (data entity) it reads, or, for
 * Google Sheets, the sheet name linked to its spreadsheet, since the node is always "sheet".
 */
export function getSourceFlowParams(
  connectorDef: ConnectorDefinitionConfig,
  configIndex: number
): FlowParam[] {
  const { source } = connectorDef.connector;

  if (source.name === GOOGLE_SHEETS_CONNECTOR_NAME) {
    const config = source.configuration[configIndex];
    const sheetName = typeof config.SheetName === 'string' ? config.SheetName.trim() : '';
    const spreadsheet = typeof config.SpreadsheetId === 'string' ? config.SpreadsheetId.trim() : '';
    if (sheetName) {
      return [
        {
          label: 'Sheet',
          value: sheetName,
          href: spreadsheet ? spreadsheetUrlFrom(spreadsheet) : undefined,
        },
      ];
    }
  }

  return [{ label: 'Data', value: source.node || 'No node selected' }];
}
