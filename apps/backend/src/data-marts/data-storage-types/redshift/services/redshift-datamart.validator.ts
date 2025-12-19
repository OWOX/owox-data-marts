import { Injectable } from '@nestjs/common';
import {
  DataMartValidator,
  ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { RedshiftQueryBuilder } from './redshift-query.builder';
import { isRedshiftConfig } from '../../data-storage-config.guards';
import { isRedshiftCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class RedshiftDataMartValidator implements DataMartValidator {
  readonly type = DataStorageType.AWS_REDSHIFT;

  constructor(
    private readonly adapterFactory: RedshiftApiAdapterFactory,
    private readonly queryBuilder: RedshiftQueryBuilder
  ) {}

  async validate(
    dataMartDefinition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    if (!isRedshiftConfig(config)) {
      return ValidationResult.failure('Incompatible data storage config');
    }

    if (!isRedshiftCredentials(credentials)) {
      return ValidationResult.failure('Incompatible data storage credentials');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      const query = this.queryBuilder.buildQuery(dataMartDefinition, {
        limit: 0,
      });

      await adapter.executeDryRunQuery(query);

      return ValidationResult.success();
    } catch (error) {
      return ValidationResult.failure('Data mart validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
