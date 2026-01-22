import { Injectable } from '@nestjs/common';
import { SqlRunExecutor } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isOwoxLegacyCredentials } from '../../data-storage-credentials.guards';
import { isOwoxLegacyConfig } from '../../data-storage-config.guards';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { BigQuerySqlRunExecutor } from '../../bigquery/services/bigquery-sql-run.executor';
import { BigQueryConfig } from '../../bigquery/schemas/bigquery-config.schema';

/**
 * OWOX Legacy SQL Run Executor.
 * Delegates execution to BigQuery with converted config (adds default location).
 */
@Injectable()
export class OwoxLegacySqlRunExecutor implements SqlRunExecutor {
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

    private static readonly DEFAULT_LOCATION = 'US';

    constructor(private readonly bigQueryExecutor: BigQuerySqlRunExecutor) { }

    async *execute<Row = Record<string, unknown>>(
        credentials: DataStorageCredentials,
        config: DataStorageConfig,
        definition: DataMartDefinition,
        sql: string | undefined,
        options?: { maxRowsPerBatch?: number }
    ): AsyncIterable<SqlRunBatch<Row>> {
        if (!isOwoxLegacyCredentials(credentials)) {
            throw new Error('OWOX Legacy storage credentials expected');
        }
        if (!isOwoxLegacyConfig(config)) {
            throw new Error('OWOX Legacy storage config expected');
        }

        // Convert OWOX Legacy config to BigQuery config by adding location
        const bigQueryConfig: BigQueryConfig = {
            projectId: config.projectId,
            location: OwoxLegacySqlRunExecutor.DEFAULT_LOCATION,
        };

        // Delegate to BigQuery executor
        yield* this.bigQueryExecutor.execute<Row>(
            credentials,
            bigQueryConfig,
            definition,
            sql,
            options
        );
    }
}
