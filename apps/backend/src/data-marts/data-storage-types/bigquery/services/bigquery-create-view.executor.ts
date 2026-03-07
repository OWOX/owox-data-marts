import { Injectable } from '@nestjs/common';
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
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

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
  ): Promise<string | undefined> {
    if (config.location !== BIGQUERY_AUTODETECT_LOCATION) {
      return config.location;
    }

    // for location auto-detection
    const dryRunResult = await adapter.executeDryRunQuery(sql);
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
    location?: string
  ): Promise<string> {
    const projectId = config.projectId;

    // CASE 1 — already fully qualified: project.dataset.view
    if (viewName.split('.').length === 3) {
      return viewName;
    }

    // CASE 2 — not fully qualified → use owox_internal as default dataset
    const datasetId = 'owox_internal';

    const ddlDataset = this.buildCreateSchemaQuery(projectId, datasetId, location);
    await adapter.executeQuery(ddlDataset);

    return `${projectId}.${datasetId}.${viewName}`;
  }

  private buildCreateSchemaQuery(projectId: string, datasetId: string, location?: string): string {
    const escapedDataset = `\`${projectId}.${datasetId}\``;
    if (!location) {
      return `CREATE SCHEMA IF NOT EXISTS ${escapedDataset}`;
    }

    return `CREATE SCHEMA IF NOT EXISTS ${escapedDataset} OPTIONS(location='${location}')`;
  }
}
