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
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import {
  BIGQUERY_AUTODETECT_LOCATION,
  BigQueryConfig,
  BigQueryConfigSchema,
} from '../schemas/bigquery-config.schema';

@Injectable()
export class BigQueryCreateViewExecutor implements CreateViewExecutor {
  private static readonly DEFAULT_LOCATION = 'US';

  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  private readonly logger = new Logger(BigQueryCreateViewExecutor.name);

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

    const fullyQualifiedName = await this.normalizeViewName(
      adapter,
      normalizedConfig,
      viewName,
      resolvedLocation
    );

    const ddl = `CREATE OR REPLACE VIEW \`${fullyQualifiedName}\` AS ${sql}`;
    await adapter.executeQuery(ddl);

    return { fullyQualifiedName: fullyQualifiedName };
  }

  private async resolveLocation(
    adapter: ReturnType<BigQueryApiAdapterFactory['create']>,
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

  /**
   * Normalize view name to a fully qualified BigQuery identifier.
   * If not fully qualified, create dataset if necessary and expand name.
   */
  private async normalizeViewName(
    adapter: ReturnType<BigQueryApiAdapterFactory['create']>,
    config: BigQueryConfig,
    viewName: string,
    location: string
  ): Promise<string> {
    const projectId = config.projectId;

    // CASE 1 — already fully qualified: project.dataset.view
    if (viewName.split('.').length === 3) {
      return viewName;
    }

    // CASE 2 — not fully qualified → use internal dataset per location
    const datasetId = this.buildInternalDatasetId(location);

    await this.ensureInternalDatasetExists(adapter, projectId, datasetId, location);

    return `${projectId}.${datasetId}.${viewName}`;
  }

  /**
   * Issues `CREATE SCHEMA` only when the internal dataset is actually missing.
   *
   * `CREATE SCHEMA IF NOT EXISTS` requires project-level `bigquery.datasets.create` even when
   * the dataset already exists, and OAuth-based storages run with the end user's own grants —
   * a user with data-only permissions failed the whole AI-helper/sample flow on this DDL
   * (production incident 2026-08-05, work item 6815). The existence check needs only
   * `bigquery.datasets.get`, so such users pass as long as the dataset was pre-created.
   * When the check itself fails we still fall back to the CREATE attempt: its error names the
   * missing permission, which is the most actionable message for the admin.
   */
  private async ensureInternalDatasetExists(
    adapter: ReturnType<BigQueryApiAdapterFactory['create']>,
    projectId: string,
    datasetId: string,
    location: string
  ): Promise<void> {
    try {
      if (await adapter.datasetExists(projectId, datasetId)) {
        return;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to check existence of dataset ${projectId}.${datasetId}, falling back to CREATE SCHEMA IF NOT EXISTS`,
        error
      );
    }

    const ddlDataset = this.buildCreateSchemaQuery(projectId, datasetId, location);
    await adapter.executeQuery(ddlDataset);
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
