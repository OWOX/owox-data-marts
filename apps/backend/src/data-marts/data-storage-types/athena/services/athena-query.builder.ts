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
export class AthenaQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.AWS_ATHENA;

  buildQuery(definition: DataMartDefinition): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return `SELECT * FROM ${this.escapeTablePath(definition.fullyQualifiedName)}`;
    } else if (isConnectorDefinition(definition)) {
      return `SELECT * FROM ${this.escapeTablePath(definition.connector.storage.fullyQualifiedName)}`;
    } else if (isSqlDefinition(definition)) {
      return definition.sqlQuery;
    } else if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern queries are not supported in Athena');
    } else {
      throw new Error('Invalid data mart definition');
    }
  }

  private escapeTablePath(tablePath: string): string {
    return tablePath
      .split('.')
      .map(identifier =>
        identifier.startsWith('"') && identifier.endsWith('"') ? identifier : `"${identifier}"`
      )
      .join('.');
  }
}
