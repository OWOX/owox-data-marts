import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  DataMartValidator,
  ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { SnowflakeApiAdapterFactory } from '../adapters/snowflake-api-adapter.factory';
import { isSnowflakeCredentials } from '../../data-storage-credentials.guards';
import { isSnowflakeConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { SnowflakeQueryBuilder } from './snowflake-query.builder';

@Injectable()
export class SnowflakeDataMartValidator implements DataMartValidator {
  private readonly logger = new Logger(SnowflakeDataMartValidator.name);
  readonly type = DataStorageType.SNOWFLAKE;

  constructor(
    private readonly adapterFactory: SnowflakeApiAdapterFactory,
    private readonly snowflakeQueryBuilder: SnowflakeQueryBuilder
  ) {}

  async validate(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    if (!isSnowflakeCredentials(credentials)) {
      return ValidationResult.failure('Invalid credentials');
    }
    if (!isSnowflakeConfig(config)) {
      return ValidationResult.failure('Invalid config');
    }
    try {
      const adapter = this.adapterFactory.create(credentials, config);
      const query = this.snowflakeQueryBuilder.buildQuery(definition);
      const explain = await adapter.executeDryRunQuery(query);
      this.logger.debug(`Explain: ${JSON.stringify(explain)}`);
      await adapter.destroy();
      return ValidationResult.success();
    } catch (error) {
      this.logger.warn('Dry run failed', error);
      return ValidationResult.failure(error instanceof Error ? error.message : String(error));
    }
  }
}
