import { Injectable } from '@nestjs/common';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartQueryBuilderAsync } from '../../interfaces/data-mart-query-builder.interface';
import { escapeBigQueryIdentifier } from '../utils/bigquery-identifier.utils';

@Injectable()
export class BigQueryQueryBuilder implements DataMartQueryBuilderAsync {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  async buildQuery(definition: DataMartDefinition): Promise<string> {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return `SELECT * FROM ${escapeBigQueryIdentifier(definition.fullyQualifiedName)}`;
    } else if (isConnectorDefinition(definition)) {
      return `SELECT * FROM ${escapeBigQueryIdentifier(definition.connector.storage.fullyQualifiedName)}`;
    } else if (isSqlDefinition(definition)) {
      return definition.sqlQuery;
    } else if (isTablePatternDefinition(definition)) {
      return `SELECT * FROM ${escapeBigQueryIdentifier(definition.pattern + '*')}`;
    } else {
      throw new Error('Invalid data mart definition');
    }
  }
}
