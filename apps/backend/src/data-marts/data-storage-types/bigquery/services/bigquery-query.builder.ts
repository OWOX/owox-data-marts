import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartQueryBuilder } from '../../interfaces/data-mart-query-builder.interface';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';

@Injectable()
export class BigQueryQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  buildQuery(definition: DataMartDefinition): string {
    if (isTableDefinition(definition)) {
      return `SELECT *FROM \`${definition.fullyQualifiedName}\``;
    } else if (isConnectorDefinition(definition)) {
      return `SELECT * FROM \`${definition.connector.storage.fullyQualifiedName}\``;
    } else if (isSqlDefinition(definition)) {
      return definition.sqlQuery;
    } else if (isViewDefinition(definition)) {
      return `SELECT * FROM \`${definition.fullyQualifiedName}\``;
    } else if (isTablePatternDefinition(definition)) {
      return `SELECT * FROM \`${definition.pattern}*\``;
    } else {
      throw new Error('Invalid data mart definition');
    }
  }
}
