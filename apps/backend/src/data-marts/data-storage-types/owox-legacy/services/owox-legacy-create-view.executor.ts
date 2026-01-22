import { Injectable } from '@nestjs/common';
import {
    CreateViewExecutor,
    CreateViewResult,
} from '../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isOwoxLegacyCredentials } from '../../data-storage-credentials.guards';
import { isOwoxLegacyConfig } from '../../data-storage-config.guards';
import { BigQueryApiAdapterFactory } from '../../bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryConfig } from '../../bigquery/schemas/bigquery-config.schema';

/**
 * OWOX Legacy Create View Executor.
 * Delegates to BigQuery API adapter with converted config.
 */
@Injectable()
export class OwoxLegacyCreateViewExecutor implements CreateViewExecutor {
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

    private static readonly DEFAULT_LOCATION = 'US';

    constructor(private readonly adapterFactory: BigQueryApiAdapterFactory) { }

    async createView(
        credentials: DataStorageCredentials,
        config: DataStorageConfig,
        viewName: string,
        sql: string
    ): Promise<CreateViewResult> {
        if (!isOwoxLegacyCredentials(credentials)) {
            throw new Error('OWOX Legacy storage credentials expected');
        }
        if (!isOwoxLegacyConfig(config)) {
            throw new Error('OWOX Legacy storage config expected');
        }

        // Convert to BigQuery config
        const bigQueryConfig: BigQueryConfig = {
            projectId: config.projectId,
            location: OwoxLegacyCreateViewExecutor.DEFAULT_LOCATION,
        };

        const adapter = this.adapterFactory.create(credentials, bigQueryConfig);

        const fullyQualifiedName = await this.normalizeViewName(adapter, bigQueryConfig, viewName);

        const ddl = `CREATE OR REPLACE VIEW \`${fullyQualifiedName}\` AS ${sql}`;
        await adapter.executeQuery(ddl);

        return { fullyQualifiedName: fullyQualifiedName };
    }

    private async normalizeViewName(
        adapter: ReturnType<BigQueryApiAdapterFactory['create']>,
        config: BigQueryConfig,
        viewName: string
    ): Promise<string> {
        const projectId = config.projectId;

        // CASE 1 — already fully qualified: project.dataset.view
        if (viewName.split('.').length === 3) {
            return viewName;
        }

        // CASE 2 — not fully qualified → use owox_internal as default dataset
        const datasetId = 'owox_internal';

        const ddlDataset = `CREATE SCHEMA IF NOT EXISTS \`${projectId}.${datasetId}\``;
        await adapter.executeQuery(ddlDataset);

        return `${projectId}.${datasetId}.${viewName}`;
    }
}
