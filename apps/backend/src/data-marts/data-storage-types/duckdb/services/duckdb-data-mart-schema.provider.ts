import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { isDuckDbCredentials } from '../../data-storage-credentials.guards';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaProvider } from '../../interfaces/data-mart-schema-provider.interface';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import {
  DuckDbDataMartSchema,
  DuckDbDataMartSchemaType,
  parseDuckDbFieldType,
} from '../schemas/duckdb-data-mart-schema.schema';

/**
 * Introspects a DuckDB database file to produce the data mart's actual persisted schema. The
 * file comes from `credentials.databasePath`, which the credentials resolver derives from the
 * storage id.
 */
@Injectable()
export class DuckDbDataMartSchemaProvider implements DataMartSchemaProvider {
  private readonly logger = new Logger(DuckDbDataMartSchemaProvider.name);
  readonly type = DataStorageType.DUCKDB;

  constructor(private readonly adapterFactory: DuckDbApiAdapterFactory) {}

  async getActualDataMartSchema(
    dataMartDefinition: DataMartDefinition,
    _config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<DuckDbDataMartSchema> {
    if (!isDuckDbCredentials(credentials)) throw new Error('DuckDB database path is not resolved');

    // A SQL Data Mart has no table to introspect: its columns are the query's result columns.
    const sqlQuery = isSqlDefinition(dataMartDefinition)
      ? dataMartDefinition.sqlQuery.trim().replace(/;\s*$/, '')
      : undefined;
    const tableRef =
      sqlQuery === undefined ? this.getSchemaAndTable(dataMartDefinition) : undefined;
    const target = tableRef ? `${tableRef.schema}.${tableRef.table}` : 'SQL query';
    this.logger.debug(`Introspecting DuckDB schema for ${target}`);

    const adapter = this.adapterFactory.createForDatabasePath(credentials.databasePath);

    try {
      const columns = tableRef
        ? await adapter.introspectColumns(tableRef.schema, tableRef.table)
        : await adapter.describeQuery(sqlQuery ?? '');
      return {
        type: DuckDbDataMartSchemaType,
        fields: columns.map(column => this.createField(column)),
      };
    } finally {
      // A close failure must never mask the original introspection error (or clobber a
      // successful result) — swallow it here and just log, mirroring how
      // `AthenaDataMartSchemaProvider` guards its own S3 cleanup in `finally`.
      try {
        await adapter.close();
      } catch (error) {
        this.logger.warn(`Failed to close DuckDB adapter for ${target}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private createField(column: { name: string; type: string }): DuckDbDataMartSchema['fields'][0] {
    return {
      name: column.name,
      type: parseDuckDbFieldType(column.type),
      status: DataMartSchemaFieldStatus.CONNECTED,
      isPrimaryKey: false,
      isHiddenForReporting: false,
    };
  }

  /**
   * Extracts the schema/table pair to introspect from a data mart definition, mirroring
   * `AthenaDataMartSchemaProvider.getSchemaAndTable`: split the fully qualified name on '.',
   * strip surrounding quotes, and take the LAST two segments (so both `schema.table` and a
   * catalog-qualified `catalog.schema.table` resolve to the same {schema, table} pair).
   */
  private getSchemaAndTable(definition: DataMartDefinition): { schema: string; table: string } {
    const fullyQualifiedName = this.resolveFullyQualifiedName(definition);

    const parts = fullyQualifiedName.split('.').map(part => part.replace(/^"|"$/g, ''));
    if (parts.length < 2) {
      throw new Error(`Invalid DuckDB target identifier: ${fullyQualifiedName}`);
    }

    const table = parts.pop() as string;
    const schema = parts.pop() as string;
    return { schema, table };
  }

  /**
   * A connector definition's introspection target is `connector.storage.fullyQualifiedName`;
   * a table/view definition's is the flat `fullyQualifiedName` (same derivation as
   * `DuckDbDataMartValidator.validate` and `DuckDbQueryBuilder`). Resolution is gated
   * strictly on the schema-validated type guards, mirroring
   * `AthenaDataMartSchemaProvider.getSchemaAndTable` and `DuckDbQueryBuilder`'s own
   * fail-closed resolution — there is deliberately NO structural fallback onto unvalidated
   * fields. Reading `connector.storage.fullyQualifiedName`/`fullyQualifiedName` off a
   * definition that fails these guards would let a malformed definition get its schema
   * introspected and cached here while remaining un-queryable by `DuckDbQueryBuilder`
   * (which throws for anything failing the same guards) — an inconsistent "connected but
   * un-queryable" data mart state. Throwing here is correct: the executor's `actualizeSchema`
   * call is already wrapped in a try/catch that logs and swallows.
   */
  private resolveFullyQualifiedName(definition: DataMartDefinition): string {
    if (isConnectorDefinition(definition)) {
      return definition.connector.storage.fullyQualifiedName;
    }
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return definition.fullyQualifiedName;
    }
    throw new BusinessViolationException(
      'Unsupported data mart definition for DuckDB schema introspection'
    );
  }
}
