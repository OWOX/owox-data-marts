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
import { DataMartQueryBuilder } from '../../interfaces/data-mart-query-builder.interface';
import { escapeDatabricksIdentifier } from '../utils/databricks-identifier.utils';

@Injectable()
export class DatabricksQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;

  buildQuery(definition: DataMartDefinition): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return `SELECT * FROM ${escapeDatabricksIdentifier(definition.fullyQualifiedName)}`;
    } else if (isConnectorDefinition(definition)) {
      return `SELECT * FROM ${escapeDatabricksIdentifier(definition.connector.storage.fullyQualifiedName)}`;
    } else if (isSqlDefinition(definition)) {
      return definition.sqlQuery;
    } else if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern definitions are not supported for Databricks');
    } else {
      throw new Error('Invalid data mart definition');
    }
  }
}
