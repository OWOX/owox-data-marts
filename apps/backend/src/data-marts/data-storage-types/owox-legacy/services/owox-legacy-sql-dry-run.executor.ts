import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { SqlDryRunResult } from '../../../dto/domain/sql-dry-run-result.dto';
import { isOwoxLegacyConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isOwoxLegacyCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { SqlDryRunExecutor } from '../../interfaces/sql-dry-run-executor.interface';
import { BigQueryApiAdapterFactory } from '../../bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryConfig } from '../../bigquery/schemas/bigquery-config.schema';

/**
 * OWOX Legacy SQL Dry Run Executor.
 * Delegates to BigQuery API adapter with converted config.
 */
@Injectable()
export class OwoxLegacySqlDryRunExecutor implements SqlDryRunExecutor {
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    private readonly logger = new Logger(OwoxLegacySqlDryRunExecutor.name);

    private static readonly DEFAULT_LOCATION = 'US';

    constructor(private readonly adapterFactory: BigQueryApiAdapterFactory) { }

    async execute(
        dataStorageCredentials: DataStorageCredentials,
        dataStorageConfig: DataStorageConfig,
        sql: string
    ): Promise<SqlDryRunResult> {
        this.logger.debug('Executing SQL dry run', sql);

        if (!isOwoxLegacyCredentials(dataStorageCredentials)) {
            throw new BusinessViolationException('OWOX Legacy storage credentials expected');
        }

        if (!isOwoxLegacyConfig(dataStorageConfig)) {
            throw new BusinessViolationException('OWOX Legacy storage config expected');
        }

        // Convert to BigQuery config
        const bigQueryConfig: BigQueryConfig = {
            projectId: dataStorageConfig.projectId,
            location: OwoxLegacySqlDryRunExecutor.DEFAULT_LOCATION,
        };

        try {
            const adapter = this.adapterFactory.create(dataStorageCredentials, bigQueryConfig);
            const result = await adapter.executeDryRunQuery(sql ?? '');
            return SqlDryRunResult.success(result.totalBytesProcessed);
        } catch (error) {
            this.logger.debug('Dry run failed', error);
            return SqlDryRunResult.failed(error.message);
        }
    }
}
