import { Injectable } from '@nestjs/common';
import { DataMartDefinition } from '../../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isSqlDefinition } from '../../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryQueryBuilder } from '../bigquery-query.builder';
import { LegacyBigQuerySqlPreprocessor } from './legacy-bigquery-sql-preprocessor.service';

@Injectable()
export class LegacyBigQueryQueryBuilder extends BigQueryQueryBuilder {
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(private readonly preprocessor: LegacyBigQuerySqlPreprocessor) {
    super();
  }

  async buildQuery(definition: DataMartDefinition): Promise<string> {
    if (isSqlDefinition(definition)) {
      return this.preprocessor.prepare(definition.sqlQuery);
    } else {
      throw new Error('Invalid data mart definition');
    }
  }
}
