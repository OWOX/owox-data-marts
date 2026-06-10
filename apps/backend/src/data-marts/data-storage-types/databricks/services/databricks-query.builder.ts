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
import {
  DataMartQueryBuilder,
  DataMartQueryOptions,
} from '../../interfaces/data-mart-query-builder.interface';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import {
  escapeDatabricksIdentifier,
  escapeFullyQualifiedIdentifier,
} from '../utils/databricks-identifier.utils';
import { DatabricksClauseRenderer } from './databricks-clause-renderer';

@Injectable()
export class DatabricksQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;

  constructor(private readonly clauseRenderer: DatabricksClauseRenderer) {}

  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string {
    const hasOutputControls =
      (queryOptions?.filters?.length ?? 0) > 0 ||
      (queryOptions?.sort?.length ?? 0) > 0 ||
      queryOptions?.limit != null;

    const selectList = this.buildSelectList(queryOptions?.columns);

    if (!hasOutputControls) {
      return this.buildPlainQuery(definition, selectList, queryOptions);
    }

    const fromClause = this.resolveFromClauseWithOutputControls(definition, queryOptions);
    const columnTypes = queryOptions?.columnTypes;
    const resolveColumnType = columnTypes
      ? (rule: FilterRule) => columnTypes.get(rule.column)
      : undefined;
    const where = this.clauseRenderer.renderWhere(
      queryOptions?.filters ?? [],
      undefined,
      'p',
      resolveColumnType
    );
    const orderBy = this.clauseRenderer.renderOrderBy(queryOptions?.sort ?? []);
    const limit = this.clauseRenderer.renderLimit(queryOptions?.limit ?? null);

    // Databricks inlines every literal — no path carries bound params. Fail fast if a
    // fragment ever emitted one (the reader rejects parameterized sqlOverride).
    const paramCount = where.params.length + orderBy.params.length + limit.params.length;
    if (paramCount > 0) {
      throw new Error(
        `DatabricksQueryBuilder expected zero bound params (literals are inlined) but got ${paramCount}`
      );
    }

    return `SELECT ${selectList} FROM ${fromClause}${where.sql}${orderBy.sql}${limit.sql}`;
  }

  private buildPlainQuery(
    definition: DataMartDefinition,
    selectList: string,
    queryOptions?: DataMartQueryOptions
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      const parts = definition.fullyQualifiedName.split('.');
      return `SELECT ${selectList} FROM ${escapeFullyQualifiedIdentifier(parts)}`;
    }
    if (isConnectorDefinition(definition)) {
      const parts = definition.connector.storage.fullyQualifiedName.split('.');
      return `SELECT ${selectList} FROM ${escapeFullyQualifiedIdentifier(parts)}`;
    }
    if (isSqlDefinition(definition)) {
      if (queryOptions?.columns?.length) {
        const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
        return `SELECT ${selectList} FROM (${cleanQuery})`;
      }
      return definition.sqlQuery.trim();
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern definitions are not supported for Databricks');
    }
    throw new Error('Invalid data mart definition');
  }

  private resolveFromClauseWithOutputControls(
    definition: DataMartDefinition,
    options?: DataMartQueryOptions
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return escapeFullyQualifiedIdentifier(definition.fullyQualifiedName.split('.'));
    }
    if (isConnectorDefinition(definition)) {
      return escapeFullyQualifiedIdentifier(
        definition.connector.storage.fullyQualifiedName.split('.')
      );
    }
    if (isSqlDefinition(definition)) {
      // Prefer the pre-materialized view the composer resolves (mirrors Snowflake/Redshift);
      // fall back to wrapping the raw SQL when no reference was supplied (e.g. schema probe).
      if (options?.mainTableReference) {
        return options.mainTableReference;
      }
      const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
      return `(${cleanQuery})`;
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern definitions are not supported for Databricks');
    }
    throw new Error('Invalid data mart definition');
  }

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeDatabricksIdentifier(col)).join(', ');
  }
}
