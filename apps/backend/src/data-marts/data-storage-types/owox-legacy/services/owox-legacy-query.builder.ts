import { Injectable } from '@nestjs/common';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
    isConnectorDefinition,
    isSqlDefinition,
    isTableDefinition,
    isTablePatternDefinition,
    isViewDefinition,
    isLegacyExtensionSqlDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartQueryBuilder } from '../../interfaces/data-mart-query-builder.interface';

/**
 * OWOX Legacy Query Builder.
 * Same logic as BigQuery query builder, supports legacy extension SQL definition.
 */
@Injectable()
export class OwoxLegacyQueryBuilder implements DataMartQueryBuilder {
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

    buildQuery(definition: DataMartDefinition): string {
        if (isTableDefinition(definition) || isViewDefinition(definition)) {
            return `SELECT * FROM \`${definition.fullyQualifiedName}\``;
        } else if (isConnectorDefinition(definition)) {
            return `SELECT * FROM \`${definition.connector.storage.fullyQualifiedName}\``;
        } else if (isSqlDefinition(definition)) {
            return definition.sqlQuery;
        } else if (isTablePatternDefinition(definition)) {
            return `SELECT * FROM \`${definition.pattern}*\``;
        } else if (isLegacyExtensionSqlDefinition(definition)) {
            return definition.query;
        } else {
            throw new Error('Invalid data mart definition');
        }
    }
}
