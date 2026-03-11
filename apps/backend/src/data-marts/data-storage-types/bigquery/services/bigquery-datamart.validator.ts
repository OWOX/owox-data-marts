import { Injectable, Logger } from '@nestjs/common';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isBigQueryCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  DataMartValidator,
  ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigQueryQueryBuilder } from './bigquery-query.builder';

@Injectable()
export class BigQueryDataMartValidator implements DataMartValidator {
  readonly logger = new Logger(BigQueryDataMartValidator.name);
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  constructor(
    protected readonly adapterFactory: BigQueryApiAdapterFactory,
    protected readonly bigQueryQueryBuilder: BigQueryQueryBuilder
  ) {}

  async validate(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    if (!isBigQueryCredentials(credentials)) {
      return ValidationResult.failure('Invalid credentials');
    }
    if (!isBigQueryConfig(config)) {
      return ValidationResult.failure('Invalid config');
    }
    try {
      const adapter = this.adapterFactory.create(credentials, config);
      const query = await this.bigQueryQueryBuilder.buildQuery(definition);
      const result = await adapter.executeDryRunQuery(query);
      return ValidationResult.success(result);
    } catch (error) {
      this.logger.warn('Dry run failed', error);
      return ValidationResult.failure(error instanceof Error ? error.message : String(error));
    }
  }
}
