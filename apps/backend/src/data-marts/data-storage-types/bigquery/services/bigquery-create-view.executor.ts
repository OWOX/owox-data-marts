import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  CreateViewExecutor,
  CreateViewResult,
} from '../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isBigQueryCredentials } from '../../data-storage-credentials.guards';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { BigQueryApiAdapter } from '../adapters/bigquery-api.adapter';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import {
  BIGQUERY_AUTODETECT_LOCATION,
  BigQueryConfig,
  BigQueryConfigSchema,
} from '../schemas/bigquery-config.schema';

/** View label that holds the hash of the SQL the view was created from. */
const SQL_HASH_LABEL = 'owox_sql_hash';

interface ViewReference {
  projectId: string;
  datasetId: string;
  tableId: string;
  /** The view goes to the internal dataset for its location, which the DDL creates on demand. */
  internal: boolean;
}

@Injectable()
export class BigQueryCreateViewExecutor implements CreateViewExecutor {
  private static readonly DEFAULT_LOCATION = 'US';
  /** Wait before reading the view again after a rate-limited DDL; a view DDL takes about a second. */
  private static readonly RECHECK_MS = 2000;

  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  private readonly logger = new Logger(BigQueryCreateViewExecutor.name);
  private readonly pendingRefreshes = new Map<string, Promise<void>>();

  constructor(private readonly adapterFactory: BigQueryApiAdapterFactory) {}

  async createView(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    viewName: string,
    sql: string
  ): Promise<CreateViewResult> {
    if (!isBigQueryCredentials(credentials)) {
      throw new Error('BigQuery storage credentials expected');
    }
    if (!isBigQueryConfig(config)) {
      throw new Error('BigQuery storage config expected');
    }

    const normalizedConfig = BigQueryConfigSchema.parse(config);

    const adapter = this.adapterFactory.create(credentials, normalizedConfig);
    const resolvedLocation = await this.resolveLocation(adapter, normalizedConfig, sql);

    const view = this.resolveViewReference(normalizedConfig.projectId, viewName, resolvedLocation);
    const fullyQualifiedName = `${view.projectId}.${view.datasetId}.${view.tableId}`;

    // Every read of a SQL Data Mart comes here, and BigQuery allows 5 updates of one table in
    // 10 seconds. So the DDL runs only when the view holds other SQL, and concurrent reads share it.
    const sqlHash = createHash('sha256').update(sql).digest('hex').slice(0, 32);
    const key = `${fullyQualifiedName}␟${sqlHash}`;
    let refresh = this.pendingRefreshes.get(key);
    if (!refresh) {
      refresh = this.refreshView(
        adapter,
        view,
        fullyQualifiedName,
        resolvedLocation,
        sql,
        sqlHash
      ).finally(() => this.pendingRefreshes.delete(key));
      this.pendingRefreshes.set(key, refresh);
    }
    await refresh;

    return { fullyQualifiedName };
  }

  private async refreshView(
    adapter: BigQueryApiAdapter,
    view: ViewReference,
    fullyQualifiedName: string,
    location: string,
    sql: string,
    sqlHash: string
  ): Promise<void> {
    if ((await this.readSqlHash(adapter, view)) === sqlHash) {
      return;
    }

    if (view.internal) {
      await adapter.executeQuery(
        this.buildCreateSchemaQuery(view.projectId, view.datasetId, location)
      );
    }
    try {
      await adapter.executeQuery(
        `CREATE OR REPLACE VIEW \`${fullyQualifiedName}\` OPTIONS(labels=[('${SQL_HASH_LABEL}', '${sqlHash}')]) AS ${sql}`
      );
    } catch (error) {
      // Other instances refresh the same view at the same time, and BigQuery rejects the DDLs
      // above its limit. If one of them wrote this SQL, the view is current.
      if (!(error instanceof Error) || !error.message.includes('Exceeded rate limits')) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, BigQueryCreateViewExecutor.RECHECK_MS));
      if ((await this.readSqlHash(adapter, view)) !== sqlHash) {
        throw error;
      }
    }
  }

  /** A view that cannot be read (missing view or dataset, no permission) reads as no hash. */
  private readSqlHash(
    adapter: BigQueryApiAdapter,
    view: ViewReference
  ): Promise<string | undefined> {
    return adapter
      .createTableReference(view.projectId, view.datasetId, view.tableId)
      .getMetadata()
      .then(
        ([metadata]) =>
          (metadata as { labels?: Record<string, string> } | undefined)?.labels?.[SQL_HASH_LABEL],
        (error: unknown) => {
          // Not a missing view: without this read every refresh runs the DDL, so say why.
          if ((error as { code?: unknown } | null)?.code !== 404) {
            this.logger.warn(`Cannot read BigQuery view labels: ${String(error)}`);
          }
          return undefined;
        }
      );
  }

  private async resolveLocation(
    adapter: BigQueryApiAdapter,
    config: BigQueryConfig,
    sql: string
  ): Promise<string> {
    const configuredLocation = config.location;
    if (configuredLocation && configuredLocation !== BIGQUERY_AUTODETECT_LOCATION) {
      return configuredLocation;
    }

    // Location can be autodetect or empty, so rely on dry-run metadata.
    const dryRunResult = await adapter.executeDryRunQuery(sql);
    if (!dryRunResult.location) {
      this.logger.warn('BigQuery dry run did not return location. Use default location US.');
      return BigQueryCreateViewExecutor.DEFAULT_LOCATION;
    }
    return dryRunResult.location;
  }

  /** A bare view name goes to the internal dataset for the location. */
  private resolveViewReference(
    projectId: string,
    viewName: string,
    location: string
  ): ViewReference {
    const parts = viewName.split('.');
    if (parts.length === 3) {
      return { projectId: parts[0], datasetId: parts[1], tableId: parts[2], internal: false };
    }
    return {
      projectId,
      datasetId: this.buildInternalDatasetId(location),
      tableId: viewName,
      internal: true,
    };
  }

  private buildInternalDatasetId(location: string): string {
    const locationSuffix = this.normalizeLocationForDatasetId(location);
    return `owox_internal_${locationSuffix}`;
  }

  private normalizeLocationForDatasetId(location: string): string {
    const normalizedLocation = location
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    return normalizedLocation || BigQueryCreateViewExecutor.DEFAULT_LOCATION.toLowerCase();
  }

  private buildCreateSchemaQuery(projectId: string, datasetId: string, location: string): string {
    const escapedDataset = `\`${projectId}.${datasetId}\``;
    return `CREATE SCHEMA IF NOT EXISTS ${escapedDataset} OPTIONS(location='${location}')`;
  }
}
