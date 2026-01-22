import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { OwoxLegacyConfigSchema } from '../schemas/owox-legacy-config.schema';
import { OwoxLegacyCredentialsSchema } from '../schemas/owox-legacy-credentials.schema';
import {
    DataStorageAccessValidator,
    ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { BigQueryApiAdapter } from '../../bigquery/adapters/bigquery-api.adapter';
import { BigQueryConfig } from '../../bigquery/schemas/bigquery-config.schema';

/**
 * OWOX Legacy Access Validator.
 * Validates access by delegating to BigQuery API with converted config.
 */
@Injectable()
export class OwoxLegacyAccessValidator implements DataStorageAccessValidator {
    private readonly logger = new Logger(OwoxLegacyAccessValidator.name);
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

    private static readonly DEFAULT_LOCATION = 'US';

    async validate(
        config: DataStorageConfig,
        credentials: DataStorageCredentials
    ): Promise<ValidationResult> {
        const configOpt = OwoxLegacyConfigSchema.safeParse(config);
        if (!configOpt.success) {
            this.logger.warn('Invalid config', configOpt.error);
            return new ValidationResult(false, 'Invalid config', { errors: configOpt.error.errors });
        }

        const credentialsOpt = OwoxLegacyCredentialsSchema.safeParse(credentials);
        if (!credentialsOpt.success) {
            this.logger.warn('Invalid credentials', credentialsOpt.error);
            return new ValidationResult(false, 'Invalid credentials', {
                errors: credentialsOpt.error.errors,
            });
        }

        // Convert to BigQuery config
        const bigQueryConfig: BigQueryConfig = {
            projectId: configOpt.data.projectId,
            location: OwoxLegacyAccessValidator.DEFAULT_LOCATION,
        };

        const apiAdapter = new BigQueryApiAdapter(credentialsOpt.data, bigQueryConfig);
        try {
            await apiAdapter.checkAccess();
            return new ValidationResult(true);
        } catch (error) {
            this.logger.warn('Access validation failed', error);
            return new ValidationResult(false, 'Access validation failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
