import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  DataMartValidator,
  ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { isBigQueryCredentials } from '../../data-storage-credentials.guards';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { BigQueryQueryBuilder } from './bigquery-query.builder';

@Injectable()
export class BigQueryDataMartValidator implements DataMartValidator {
  private readonly logger = new Logger(BigQueryDataMartValidator.name);
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  constructor(
    private readonly adapterFactory: BigQueryApiAdapterFactory,
    private readonly bigQueryQueryBuilder: BigQueryQueryBuilder
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
      const query = this.bigQueryQueryBuilder.buildQuery(definition);
      const result = await adapter.executeDryRunQuery(query);
      return ValidationResult.success(result);
    } catch (error) {
      this.logger.warn('Dry run failed', error);
      return ValidationResult.failure(error instanceof Error ? error.message : String(error));
    }
  }
}
