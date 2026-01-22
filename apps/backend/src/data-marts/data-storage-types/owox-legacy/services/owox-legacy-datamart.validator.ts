import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
    DataMartValidator,
    ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { BigQueryApiAdapterFactory } from '../../bigquery/adapters/bigquery-api-adapter.factory';
import { isOwoxLegacyCredentials } from '../../data-storage-credentials.guards';
import { isOwoxLegacyConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { OwoxLegacyQueryBuilder } from './owox-legacy-query.builder';
import { BigQueryConfig } from '../../bigquery/schemas/bigquery-config.schema';

/**
 * OWOX Legacy DataMart Validator.
 * Validates datamarts by delegating to BigQuery API adapter with converted config.
 */
@Injectable()
export class OwoxLegacyDataMartValidator implements DataMartValidator {
    private readonly logger = new Logger(OwoxLegacyDataMartValidator.name);
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

    private static readonly DEFAULT_LOCATION = 'US';

    constructor(
        private readonly adapterFactory: BigQueryApiAdapterFactory,
        private readonly queryBuilder: OwoxLegacyQueryBuilder
    ) { }

    async validate(
        definition: DataMartDefinition,
        config: DataStorageConfig,
        credentials: DataStorageCredentials
    ): Promise<ValidationResult> {
        if (!isOwoxLegacyCredentials(credentials)) {
            return ValidationResult.failure('Invalid credentials');
        }
        if (!isOwoxLegacyConfig(config)) {
            return ValidationResult.failure('Invalid config');
        }

        // Convert to BigQuery config
        const bigQueryConfig: BigQueryConfig = {
            projectId: config.projectId,
            location: OwoxLegacyDataMartValidator.DEFAULT_LOCATION,
        };

        try {
            const adapter = this.adapterFactory.create(credentials, bigQueryConfig);
            const query = this.queryBuilder.buildQuery(definition);
            const result = await adapter.executeDryRunQuery(query);
            return ValidationResult.success(result);
        } catch (error) {
            this.logger.warn('Dry run failed', error);
            return ValidationResult.failure(error instanceof Error ? error.message : String(error));
        }
    }
}
