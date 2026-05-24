import { Logger, NotImplementedException } from '@nestjs/common';
import {
  BlendedQueryBuilder,
  BlendedQueryContext,
  ResolvedRelationshipChain,
} from './blended-query-builder.interface';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { AggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import { ColumnRefResolver, SqlClauseRenderer, SqlParameter } from '../utils/sql-clause-renderer';
import { FilterRule, aliasPathToCteName } from '../../dto/schemas/filter-config.schema';

interface BlendTreeNode {
  chain: ResolvedRelationshipChain;
  children: BlendTreeNode[];
}

// Embedded newlines / `--` in title/url would close the SQL comment and expose
// trailing input as executable SQL.
function sanitizeSqlComment(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/--/g, '—')
    .trim();
}

interface PassthroughField {
  outputAlias: string;
  aggregateFunction: AggregateFunction;
  isHidden: boolean;
}

/**
 * Base class for blended SQL query builders.
 *
 * Produces CTE-based SQL using a **bottom-up** join strategy that guarantees
 * the result row count never exceeds the main data mart's row count.
 *
 * The algorithm works by processing leaf data marts first, aggregating them
 * by their join key to the parent, then LEFT JOINing the aggregated results
 * into the parent's raw data, and aggregating again — all the way up to the
 * root level. At each level the GROUP BY contains ONLY the join key to that
 * node's parent, ensuring at most one output row per parent-key value.
 *
 * Filter rules with `placement: 'pre-join'` are pushed down into the
 * subsidiary `*_raw` CTE so the joined data mart is narrowed before being
 * JOINed in. Filter rules with `placement: 'post-join'` (the default) are
 * applied to the final SELECT.
 *
 * Slice semantics: subsidiaries are LEFT JOINed, so a slice narrows the
 * subsidiary CTE but does NOT drop home rows (unmatched home rows pass through
 * with NULL). Use a post-join filter on top for row elimination.
 *
 * ```sql
 * WITH
 *   main AS (SELECT ... FROM <mainTable>),
 *
 *   -- leaf: aggregate by join key to parent
 *   c_raw AS (SELECT ... FROM <cTable>),
 *   c AS (SELECT parent_key, AGG(field) FROM c_raw GROUP BY parent_key),
 *
 *   -- intermediate: join raw data with aggregated children, then aggregate
 *   b_raw AS (SELECT ... FROM <bTable>),
 *   b_joined AS (SELECT b_raw.*, c.child_col FROM b_raw LEFT JOIN c ON ...),
 *   b AS (SELECT main_key, AGG(own_field), RE_AGG(child_col) FROM b_joined GROUP BY main_key)
 *
 * SELECT main.col, b.own_field, b.child_col
 * FROM main
 * LEFT JOIN b ON main.key = b.key
 * ```
 *
 * Subclasses only need to override `buildAggregation` to provide
 * dialect-specific aggregate expressions (STRING_AGG is the only function
 * that differs between dialects today).
 */
export abstract class AbstractBlendedQueryBuilder implements BlendedQueryBuilder {
  abstract readonly type: DataStorageType;

  protected abstract get identifierQuoteChar(): string;

  protected abstract get clauseRenderer(): SqlClauseRenderer | null;

  private readonly logger = new Logger(AbstractBlendedQueryBuilder.name);

  buildBlendedQuery(context: BlendedQueryContext): { sql: string; params: SqlParameter[] } {
    const allFilters = context.filters ?? [];

    // Capability guard first — storages without a clauseRenderer can't honour any controls.
    const hasOutputControls =
      allFilters.length > 0 || (context.sort?.length ?? 0) > 0 || (context.limit ?? null) !== null;
    if (hasOutputControls && this.clauseRenderer === null) {
      throw new NotImplementedException(
        `Output controls not yet supported for storage type ${this.type}`
      );
    }

    const validCteNames = new Set(context.chains.map(c => c.cteName));
    const preJoinByCte = new Map<string, FilterRule[]>();
    const postJoinFilters: FilterRule[] = [];
    for (const rule of allFilters) {
      if (rule.placement === 'pre-join') {
        // aliasPath presence and "main" exclusion enforced at schema level.
        if (!rule.aliasPath) {
          throw new Error('buildBlendedQuery: pre-join rule missing aliasPath (schema bug)');
        }
        const cteName = aliasPathToCteName(rule.aliasPath);
        if (!validCteNames.has(cteName)) {
          throw new Error(
            `buildBlendedQuery: pre-join filter aliasPath='${rule.aliasPath}' ` +
              `does not resolve to any chain (cteName='${cteName}')`
          );
        }
        const list = preJoinByCte.get(cteName) ?? [];
        list.push(rule);
        preJoinByCte.set(cteName, list);
      } else {
        postJoinFilters.push(rule);
      }
    }

    const { mainTableReference, mainDataMartTitle, mainDataMartUrl, chains, columns } = context;
    const columnSet = new Set(columns);
    const referencedColumns = new Set<string>([
      ...columns,
      ...postJoinFilters.map(f => f.column),
      ...(context.sort ?? []).map(s => s.column),
    ]);

    const roots = this.buildTree(chains);

    const outputAliasToRoot = new Map<string, string>();
    const hiddenOutputAliases = new Set<string>();
    for (const root of roots) {
      this.mapOutputAliasesToRoot(root, root.chain.cteName, outputAliasToRoot, hiddenOutputAliases);
    }

    const cteBlocks: string[] = [];
    const cteParams: SqlParameter[] = [];

    const mainColumns = this.collectMainReferences(roots, referencedColumns, outputAliasToRoot);
    const mainRaw = this.buildRawCte(
      'main',
      mainTableReference,
      mainDataMartTitle,
      mainDataMartUrl,
      mainColumns,
      /* preJoinFilters */ undefined
    );
    cteBlocks.push(mainRaw.sql);
    cteParams.push(...mainRaw.params);

    for (const root of roots) {
      const { ctes, params } = this.buildSubtreeCtes(root, preJoinByCte);
      cteBlocks.push(...ctes);
      cteParams.push(...params);
    }

    const withClause = `WITH\n${cteBlocks.join(',\n\n')}`;

    const selectParts = this.buildSelectParts(columnSet, outputAliasToRoot, hiddenOutputAliases);
    const joinParts = this.buildJoinParts(roots);
    const selectClause = selectParts.length > 0 ? selectParts.join(',\n  ') : '*';

    const body =
      `SELECT\n  ${selectClause}\nFROM main` +
      (joinParts.length > 0 ? '\n' + joinParts.join('\n') : '');

    const qualifyColumn = this.buildColumnQualifier(outputAliasToRoot);
    const renderer = this.clauseRenderer;
    const where = renderer
      ? renderer.renderWhere(postJoinFilters, qualifyColumn, 'p')
      : { sql: '', params: [] as SqlParameter[] };
    const orderBy = renderer
      ? renderer.renderOrderBy(context.sort ?? [], qualifyColumn)
      : { sql: '', params: [] as SqlParameter[] };
    const limit = renderer
      ? renderer.renderLimit(context.limit ?? null)
      : { sql: '', params: [] as SqlParameter[] };
    const sql = `${withClause}\n\n${body}${where.sql}${orderBy.sql}${limit.sql}`;
    return { sql, params: [...cteParams, ...where.params, ...orderBy.params, ...limit.params] };
  }

  private buildColumnQualifier(outputAliasToRoot: Map<string, string>): ColumnRefResolver {
    return (column: string) => {
      const rootAlias = outputAliasToRoot.get(column);
      if (rootAlias) {
        return `${this.quoteIdentifier(rootAlias)}.${this.quoteIdentifier(column)}`;
      }
      return `main.${this.quoteFieldRef(column)}`;
    };
  }

  protected quoteIdentifier(name: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
    const q = this.identifierQuoteChar;
    return `${q}${name.split(q).join(q + q)}${q}`;
  }

  protected quoteFieldRef(ref: string): string {
    return ref
      .split('.')
      .map(seg => this.quoteIdentifier(seg))
      .join('.');
  }

  private buildTree(chains: ResolvedRelationshipChain[]): BlendTreeNode[] {
    const nodeMap = new Map<string, BlendTreeNode>();
    for (const chain of chains) {
      nodeMap.set(chain.cteName, { chain, children: [] });
    }
    const roots: BlendTreeNode[] = [];
    for (const chain of chains) {
      const node = nodeMap.get(chain.cteName)!;
      if (chain.parentAlias === 'main') {
        roots.push(node);
      } else {
        const parentNode = nodeMap.get(chain.parentAlias);
        if (parentNode) parentNode.children.push(node);
      }
    }
    return roots;
  }

  private buildSubtreeCtes(
    node: BlendTreeNode,
    preJoinByCte: ReadonlyMap<string, FilterRule[]>
  ): {
    ctes: string[];
    passthroughFields: PassthroughField[];
    params: SqlParameter[];
  } {
    const ctes: string[] = [];
    const params: SqlParameter[] = [];

    const childPassthroughs = new Map<string, PassthroughField[]>();
    for (const child of node.children) {
      const childResult = this.buildSubtreeCtes(child, preJoinByCte);
      ctes.push(...childResult.ctes);
      params.push(...childResult.params);
      childPassthroughs.set(child.chain.cteName, childResult.passthroughFields);
    }

    const { chain } = node;
    const alias = chain.cteName;

    const preJoinFilters = preJoinByCte.get(alias) ?? [];
    const preJoinColumns = new Set(preJoinFilters.map(r => r.column));
    const subsidiaryColumns = this.collectSubsidiaryReferences(
      chain,
      node.children,
      preJoinColumns
    );
    const rawCte = this.buildRawCte(
      `${alias}_raw`,
      chain.targetTableReference,
      chain.targetDataMartTitle,
      chain.targetDataMartUrl,
      subsidiaryColumns,
      preJoinFilters,
      `s_${alias}_`
    );
    ctes.push(rawCte.sql);
    params.push(...rawCte.params);

    const hasChildren = node.children.length > 0;
    if (hasChildren) {
      ctes.push(this.buildJoinedCte(node, childPassthroughs));
    }

    const allPassthroughFields = this.collectAllPassthroughs(childPassthroughs);
    ctes.push(this.buildAggregationCte(chain, hasChildren, allPassthroughFields));

    const passthroughFields: PassthroughField[] = chain.blendedFields.map(f => ({
      outputAlias: f.outputAlias,
      aggregateFunction: f.aggregateFunction,
      isHidden: f.isHidden,
    }));
    for (const pt of allPassthroughFields) {
      passthroughFields.push({
        outputAlias: pt.outputAlias,
        aggregateFunction: this.getReAggregateFunction(pt.aggregateFunction),
        isHidden: pt.isHidden,
      });
    }

    return { ctes, passthroughFields, params };
  }

  private collectAllPassthroughs(
    childPassthroughs: Map<string, PassthroughField[]>
  ): PassthroughField[] {
    const result: PassthroughField[] = [];
    for (const fields of childPassthroughs.values()) {
      result.push(...fields);
    }
    return result;
  }

  private buildJoinedCte(
    node: BlendTreeNode,
    childPassthroughs: Map<string, PassthroughField[]>
  ): string {
    const { chain } = node;
    const alias = chain.cteName;
    const rawAlias = `${alias}_raw`;
    const joinedAlias = `${alias}_joined`;
    const quotedRawAlias = this.quoteIdentifier(rawAlias);
    const quotedJoinedAlias = this.quoteIdentifier(joinedAlias);

    const selectParts: string[] = [];

    for (const jc of chain.relationship.joinConditions) {
      selectParts.push(`${quotedRawAlias}.${this.quoteFieldRef(jc.targetFieldName)}`);
    }

    const seen = new Set(selectParts);
    for (const field of chain.blendedFields) {
      const ref = `${quotedRawAlias}.${this.quoteFieldRef(field.targetFieldName)}`;
      if (!seen.has(ref)) {
        seen.add(ref);
        selectParts.push(ref);
      }
    }

    const joinClauses: string[] = [];
    for (const child of node.children) {
      const childAlias = child.chain.cteName;
      const quotedChildAlias = this.quoteIdentifier(childAlias);

      for (const pt of childPassthroughs.get(childAlias) ?? []) {
        selectParts.push(`${quotedChildAlias}.${this.quoteIdentifier(pt.outputAlias)}`);
      }

      const onParts = child.chain.relationship.joinConditions.map(
        jc =>
          `${quotedRawAlias}.${this.quoteFieldRef(jc.sourceFieldName)} = ${quotedChildAlias}.${this.quoteFieldRef(jc.targetFieldName)}`
      );
      joinClauses.push(`LEFT JOIN ${quotedChildAlias} ON ${onParts.join(' AND ')}`);
    }

    return (
      `  ${quotedJoinedAlias} AS (\n` +
      `    SELECT\n` +
      `      ${selectParts.join(',\n      ')}\n` +
      `    FROM ${quotedRawAlias}\n` +
      `    ${joinClauses.join('\n    ')}\n` +
      `  )`
    );
  }

  private buildRawCte(
    alias: string,
    tableReference: string,
    title: string,
    url: string,
    columns: string[],
    preJoinFilters?: FilterRule[],
    preJoinParamPrefix?: string
  ): { sql: string; params: SqlParameter[] } {
    // `quoteIdentifier` treats the input as one identifier — dotted paths
    // can't be projected, so we widen to SELECT *. Warn so the perf hit is visible.
    const hasNestedColumns = columns.some(c => c.includes('.'));
    const safeForExplicitProjection = columns.length > 0 && !hasNestedColumns;
    if (columns.length > 0 && hasNestedColumns) {
      this.logger.warn(
        `buildRawCte(${alias}): nested-path column(s) forced SELECT * on ${tableReference}`
      );
    }
    const safeTitle = sanitizeSqlComment(title);
    const safeUrl = sanitizeSqlComment(url);
    const header = `  -- ${safeTitle}\n  -- ${safeUrl}\n  ${this.quoteIdentifier(alias)} AS (\n`;

    const renderer = this.clauseRenderer;
    if (preJoinFilters?.length && !preJoinParamPrefix) {
      throw new Error(
        `buildRawCte: preJoinParamPrefix is required when preJoinFilters are present (alias='${alias}')`
      );
    }
    const paramPrefix = preJoinParamPrefix ?? '';
    const qualifyForRawCte: ColumnRefResolver = column => this.quoteFieldRef(column);
    const where =
      preJoinFilters?.length && renderer
        ? renderer.renderWhere(preJoinFilters, qualifyForRawCte, paramPrefix)
        : { sql: '', params: [] as SqlParameter[] };

    const indentedWhere = where.sql ? where.sql.replace(/^\n/, '\n    ') : '';

    const body = safeForExplicitProjection
      ? `${header}    SELECT\n      ${columns.map(c => this.quoteIdentifier(c)).join(',\n      ')}\n    FROM ${tableReference}`
      : `${header}    SELECT * FROM ${tableReference}`;

    return { sql: `${body}${indentedWhere}\n  )`, params: where.params };
  }

  private collectMainReferences(
    roots: BlendTreeNode[],
    referencedColumns: Set<string>,
    blendedAliases: Map<string, string>
  ): string[] {
    const refs = new Set<string>();
    for (const col of referencedColumns) {
      if (!blendedAliases.has(col)) refs.add(col);
    }
    for (const root of roots) {
      for (const jc of root.chain.relationship.joinConditions) refs.add(jc.sourceFieldName);
    }
    return Array.from(refs).sort();
  }

  private collectSubsidiaryReferences(
    chain: ResolvedRelationshipChain,
    children: BlendTreeNode[],
    preJoinColumns: ReadonlySet<string>
  ): string[] {
    const refs = new Set<string>();
    for (const jc of chain.relationship.joinConditions) refs.add(jc.targetFieldName);
    for (const field of chain.blendedFields) refs.add(field.targetFieldName);
    for (const child of children) {
      for (const jc of child.chain.relationship.joinConditions) refs.add(jc.sourceFieldName);
    }
    for (const col of preJoinColumns) refs.add(col);
    return Array.from(refs).sort();
  }

  private buildAggregationCte(
    chain: ResolvedRelationshipChain,
    hasChildren: boolean,
    passthroughFields: PassthroughField[]
  ): string {
    const { relationship, blendedFields, cteName } = chain;
    const alias = this.quoteIdentifier(cteName);
    const sourceAlias = hasChildren
      ? this.quoteIdentifier(`${cteName}_joined`)
      : this.quoteIdentifier(`${cteName}_raw`);

    const parentJoinKeys = relationship.joinConditions.map(jc =>
      this.quoteFieldRef(jc.targetFieldName)
    );

    const groupByKeys = [...parentJoinKeys];

    const aggregatedParts = blendedFields.map(field => {
      const aggregated = this.buildAggregation(
        field.aggregateFunction,
        this.quoteFieldRef(field.targetFieldName)
      );
      return `${aggregated} AS ${this.quoteIdentifier(field.outputAlias)}`;
    });

    const passthroughParts = passthroughFields.map(pt => {
      const reAggFunc = this.getReAggregateFunction(pt.aggregateFunction);
      const aggregated = this.buildAggregation(reAggFunc, this.quoteIdentifier(pt.outputAlias));
      return `${aggregated} AS ${this.quoteIdentifier(pt.outputAlias)}`;
    });

    const selectItems = [...groupByKeys, ...aggregatedParts, ...passthroughParts];

    return (
      `  ${alias} AS (\n` +
      `    SELECT\n` +
      `      ${selectItems.join(',\n      ')}\n` +
      `    FROM ${sourceAlias}\n` +
      `    GROUP BY ${groupByKeys.join(', ')}\n` +
      `  )`
    );
  }

  private buildSelectParts(
    columnSet: Set<string>,
    outputAliasToRoot: Map<string, string>,
    hiddenOutputAliases: Set<string>
  ): string[] {
    const parts: string[] = [];
    for (const col of columnSet) {
      const rootAlias = outputAliasToRoot.get(col);
      if (rootAlias && !hiddenOutputAliases.has(col)) {
        parts.push(`${this.quoteIdentifier(rootAlias)}.${this.quoteIdentifier(col)}`);
      } else {
        parts.push(`main.${this.quoteFieldRef(col)}`);
      }
    }
    return parts;
  }

  private mapOutputAliasesToRoot(
    node: BlendTreeNode,
    rootAlias: string,
    outputAliasToRoot: Map<string, string>,
    hiddenOutputAliases: Set<string>
  ): void {
    for (const field of node.chain.blendedFields) {
      outputAliasToRoot.set(field.outputAlias, rootAlias);
      if (field.isHidden) hiddenOutputAliases.add(field.outputAlias);
    }
    for (const child of node.children) {
      this.mapOutputAliasesToRoot(child, rootAlias, outputAliasToRoot, hiddenOutputAliases);
    }
  }

  private buildJoinParts(roots: BlendTreeNode[]): string[] {
    return roots.map(root => {
      const { relationship, parentAlias, cteName } = root.chain;
      const alias = this.quoteIdentifier(cteName);
      const parent = this.quoteIdentifier(parentAlias);

      const onParts = relationship.joinConditions.map(
        jc =>
          `${parent}.${this.quoteFieldRef(jc.sourceFieldName)} = ${alias}.${this.quoteFieldRef(jc.targetFieldName)}`
      );
      const onClause = onParts.join(' AND ');

      return `LEFT JOIN ${alias} ON ${onClause}`;
    });
  }

  protected getReAggregateFunction(aggregateFunction: AggregateFunction): AggregateFunction {
    switch (aggregateFunction) {
      case 'COUNT':
      case 'COUNT_DISTINCT':
        return 'SUM';
      case 'ANY_VALUE':
        return 'MAX';
      default:
        return aggregateFunction;
    }
  }

  protected buildAggregation(aggregateFunction: AggregateFunction, fieldName: string): string {
    switch (aggregateFunction) {
      case 'STRING_AGG':
        return this.buildStringAgg(fieldName);
      case 'COUNT':
        return `COUNT(${fieldName})`;
      case 'COUNT_DISTINCT':
        return `COUNT(DISTINCT ${fieldName})`;
      default:
        return `${aggregateFunction}(${fieldName})`;
    }
  }

  protected abstract buildStringAgg(fieldName: string): string;
}
