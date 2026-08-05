import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { ResolvedRelationshipChain } from '../interfaces/blended-query-builder.interface';
import { ColumnRefResolver, ColumnTypeResolver, SqlParameter } from '../utils/sql-clause-renderer';
import { sanitizeSqlComment } from './sql-comment.utils';
import { BlendTreeNode, PassthroughField, ROW_SURROGATE_ALIAS } from './blended-query.types';
import { Logger } from '@nestjs/common';
import { BlendedSqlDialect, renderLeftJoinOn } from './blended-sql-dialect';
import { preJoinAggregateFunctionFor, reAggregateFunctionFor } from './re-aggregation';
import type { ValueSleeveIdentity } from './metric-sleeve.planner';

/**
 * Builds the CTE tree a blended query is made of: one `<alias>_raw` CTE per data mart, an
 * `<alias>_joined` CTE where a chain has children, and an `<alias>` CTE that aggregates up to
 * the parent join key. That bottom-up shape is what guarantees the blended result never has
 * more rows than the main data mart.
 *
 * Emits SQL text only — it decides nothing about output controls, and needs just the warehouse
 * dialect (`BlendedSqlDialect`) to spell identifiers, aggregates and pre-join filters.
 */
export class BlendCteBuilder {
  private readonly logger = new Logger(BlendCteBuilder.name);

  constructor(private readonly dialect: BlendedSqlDialect) {}

  buildTree(chains: ResolvedRelationshipChain[]): BlendTreeNode[] {
    const nodeMap = new Map<string, BlendTreeNode>();
    for (const chain of chains) {
      this.assertJoinKeysProjectable(chain);
      nodeMap.set(chain.cteName, { chain, children: [] });
    }
    const roots: BlendTreeNode[] = [];
    for (const chain of chains) {
      const node = nodeMap.get(chain.cteName)!;
      if (chain.parentAlias === 'main') {
        roots.push(node);
      } else {
        const parentNode = nodeMap.get(chain.parentAlias);
        // Dropping the node instead leaves the rest of the query believing it exists: its CTE is
        // never emitted, so `createColumnQualifier` falls back to `main.<col>` for its fields —
        // an unrecognized name at the warehouse, or a wrong resolution when `main` has a column
        // of that name. Reachable from a SAVED report whose relationship was deleted
        // (`buildRelationshipChains` skips the missing relationship but still builds chains for
        // its descendants), so this is user data, not an internal invariant.
        if (!parentNode) {
          throw new BusinessViolationException(
            `buildTree: joined source '${chain.cteName}' is joined through parent ` +
              `'${chain.parentAlias}', which is not part of this query — the relationship it ` +
              `referenced no longer exists. Re-save the report's joined fields to repair it`
          );
        }
        parentNode.children.push(node);
      }
    }
    return roots;
  }

  /**
   * A join key must be a TOP-LEVEL column of its Data Mart.
   *
   * The dedup CTE projects the key as `SELECT address.city … GROUP BY address.city`, and every
   * engine names that output column after the LAST segment — so the CTE exposes `city` while the
   * join back, the sleeve's identity leg and the child-to-parent join all address it as
   * `<cte>.address.city`. Nothing resolves, and the failure surfaces as a raw warehouse error
   * about a column nobody wrote.
   *
   * The API now rejects a dotted key at save time; this catches relationships stored BEFORE that,
   * which the old validator waved through — it looked the field up among the schema's top-level
   * fields, found nothing, and recorded a warning its callers discarded.
   */
  private assertJoinKeysProjectable(chain: ResolvedRelationshipChain): void {
    // A relationship with NO conditions is a supported DRAFT state at save time, so it can be
    // sitting in the database — but there is nothing to join on. Every renderer here would emit
    // `LEFT JOIN <cte> ON ` with a dangling ON and a `GROUP BY` with no keys: a raw warehouse
    // syntax error, i.e. a 5xx. The value sleeve already refused it; this is the same refusal on
    // the paths that do not build one (a plain blended report, a COUNT DISTINCT sleeve), which is
    // where it belongs — `buildTree` runs on all of them.
    if (chain.relationship.joinConditions.length === 0) {
      throw new BusinessViolationException(
        `Joined source '${chain.cteName}' has no join conditions, so it cannot be joined. ` +
          `Edit the relationship to add one`
      );
    }
    const dotted = chain.relationship.joinConditions
      .flatMap(jc => [jc.sourceFieldName, jc.targetFieldName])
      .filter(name => name.includes('.'));
    if (dotted.length === 0) return;
    throw new BusinessViolationException(
      `Joined source '${chain.cteName}' joins on nested field(s) [${dotted.join(', ')}] — a join ` +
        `key must be a top-level column. Edit the relationship to join on a top-level field`
      // Deliberately no `reservedNameColumns`: that key makes the MCP tool tell the caller to
      // rename the FIELD, which is the wrong repair here — the relationship is what must change.
    );
  }

  buildSubtreeCtes(
    node: BlendTreeNode,
    preJoinByCte: ReadonlyMap<string, FilterRule[]>,
    resolveColumnType?: ColumnTypeResolver,
    valueSleeveOwners?: ReadonlyMap<string, ValueSleeveIdentity>
  ): {
    ctes: string[];
    passthroughFields: PassthroughField[];
    params: SqlParameter[];
  } {
    const ctes: string[] = [];
    const params: SqlParameter[] = [];

    const childPassthroughs = new Map<string, PassthroughField[]>();
    for (const child of node.children) {
      const childResult = this.buildSubtreeCtes(
        child,
        preJoinByCte,
        resolveColumnType,
        valueSleeveOwners
      );
      ctes.push(...childResult.ctes);
      params.push(...childResult.params);
      childPassthroughs.set(child.chain.cteName, childResult.passthroughFields);
    }

    const { chain } = node;
    const alias = chain.cteName;

    const preJoinFilters = preJoinByCte.get(alias) ?? [];
    const preJoinColumns = new Set(preJoinFilters.map(r => r.column));
    // Only a keyless owner pays for the surrogate window.
    const valueSleeveIdentity = valueSleeveOwners?.get(alias);
    const identityColumns =
      valueSleeveIdentity?.kind === 'primary-key' ? valueSleeveIdentity.columns : [];
    const subsidiaryColumns = this.collectSubsidiaryReferences(
      chain,
      node.children,
      preJoinColumns,
      identityColumns
    );
    const rawCte = this.buildRawCte(
      `${alias}_raw`,
      chain.targetTableReference,
      chain.targetDataMartTitle,
      chain.targetDataMartUrl,
      subsidiaryColumns,
      preJoinFilters,
      `s_${alias}_`,
      resolveColumnType,
      valueSleeveIdentity?.kind === 'row-surrogate',
      // partition the surrogate by this chain's OWN parent-join key, so the
      // window is computed per key group instead of once over the whole joined mart. The
      // value sleeve carries the same key alongside `__owox_rid` in its DISTINCT tuple, which
      // is what keeps two different owners' identical row numbers apart.
      chain.relationship.joinConditions.map(jc => jc.targetFieldName)
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
        aggregateFunction: reAggregateFunctionFor(pt.aggregateFunction),
        isHidden: pt.isHidden,
      });
    }

    return { ctes, passthroughFields, params };
  }

  collectAllPassthroughs(childPassthroughs: Map<string, PassthroughField[]>): PassthroughField[] {
    const result: PassthroughField[] = [];
    for (const fields of childPassthroughs.values()) {
      result.push(...fields);
    }
    return result;
  }

  buildJoinedCte(node: BlendTreeNode, childPassthroughs: Map<string, PassthroughField[]>): string {
    const { chain } = node;
    const alias = chain.cteName;
    const rawAlias = `${alias}_raw`;
    const joinedAlias = `${alias}_joined`;
    const quotedRawAlias = this.dialect.quoteIdentifier(rawAlias);
    const quotedJoinedAlias = this.dialect.quoteIdentifier(joinedAlias);

    const selectParts: string[] = [];

    for (const jc of chain.relationship.joinConditions) {
      selectParts.push(`${quotedRawAlias}.${this.dialect.quoteFieldRef(jc.targetFieldName)}`);
    }

    const seen = new Set(selectParts);
    for (const field of chain.blendedFields) {
      const ref = `${quotedRawAlias}.${this.dialect.quoteFieldRef(field.targetFieldName)}`;
      if (!seen.has(ref)) {
        seen.add(ref);
        selectParts.push(ref);
      }
    }

    const joinClauses: string[] = [];
    for (const child of node.children) {
      const childAlias = child.chain.cteName;
      const quotedChildAlias = this.dialect.quoteIdentifier(childAlias);

      for (const pt of childPassthroughs.get(childAlias) ?? []) {
        selectParts.push(`${quotedChildAlias}.${this.dialect.quoteIdentifier(pt.outputAlias)}`);
      }

      joinClauses.push(
        renderLeftJoinOn(this.dialect, {
          leftAlias: rawAlias,
          rightAlias: child.chain.cteName,
          joinConditions: child.chain.relationship.joinConditions,
        })
      );
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

  buildRawCte(
    alias: string,
    tableReference: string,
    title: string,
    url: string,
    columns: string[],
    preJoinFilters?: FilterRule[],
    preJoinParamPrefix?: string,
    resolveColumnType?: ColumnTypeResolver,
    includeRowSurrogate?: boolean,
    rowSurrogatePartitionColumns?: readonly string[]
  ): { sql: string; params: SqlParameter[] } {
    // Reserved: a value-sleeve owner's raw CTE projects the surrogate as `__owox_rid` (below).
    // A real source column of the same name would silently collide with it — fail loud. This
    // is USER DATA (a source/join/blended-field column can be named anything), not an
    // invariant, so it must surface as a clean, actionable error rather than a bare 500.
    //
    // Matched case-INSENSITIVELY, and unconditionally rather than per dialect: the alias is a
    // safe identifier, so `quoteIdentifier` leaves it unquoted, and Athena/Redshift then fold it
    // to lower case while Spark resolves identifiers case-insensitively — `__OWOX_RID` collides
    // there exactly as the lower-case spelling does. Snowflake always quotes, so the name would
    // in fact be safe there; a dialect-dependent guard would mean the SAME saved report is
    // accepted on one warehouse and silently corrupted on another, which is worse than rejecting
    // a name that would technically have worked on one of them.
    const foldedSurrogateAlias = ROW_SURROGATE_ALIAS.toLowerCase();
    const surrogateCollision = includeRowSurrogate
      ? columns.find(c => c.toLowerCase() === foldedSurrogateAlias)
      : undefined;
    if (surrogateCollision) {
      throw new BusinessViolationException(
        `buildRawCte(${alias}): column '${surrogateCollision}' collides with the reserved ` +
          `row-surrogate alias '${ROW_SURROGATE_ALIAS}' — rename the source column or its ` +
          `join/blended-field reference`,
        // Structured so callers that must not forward a raw message can still name the column.
        // The MCP tool builds its guidance from this alone; without it the message is dropped
        // and the agent gets an opaque failure it cannot act on.
        { reservedNameColumns: [surrogateCollision] }
      );
    }

    // `quoteIdentifier` treats the input as one identifier — dotted paths
    // can't be projected, so we widen to SELECT *. Warn so the perf hit is visible.
    const hasNestedColumns = columns.some(c => c.includes('.'));
    const safeForExplicitProjection = columns.length > 0 && !hasNestedColumns;
    if (columns.length > 0 && hasNestedColumns) {
      // Under `SELECT *` the reserved `__owox_rid` collision guard above can only inspect the
      // small tracked `columns` set, NOT the physical table's full projection — so a real
      // column literally named `__owox_rid` on this table would silently collide with the
      // surrogate (two `__owox_rid` columns → ambiguous downstream). Make that blind spot visible.
      const surrogateCaveat =
        includeRowSurrogate && !surrogateCollision
          ? ` — '${ROW_SURROGATE_ALIAS}' collision with a physical table column cannot be statically verified under SELECT *`
          : '';
      this.logger.warn(
        `buildRawCte(${alias}): nested-path column(s) forced SELECT * on ${tableReference}${surrogateCaveat}`
      );
    }
    const safeTitle = sanitizeSqlComment(title);
    const safeUrl = sanitizeSqlComment(url);
    const header = `  -- ${safeTitle}\n  -- ${safeUrl}\n  ${this.dialect.quoteIdentifier(alias)} AS (\n`;

    const renderer = this.dialect.clauseRenderer();
    if (preJoinFilters?.length && !preJoinParamPrefix) {
      throw new Error(
        `buildRawCte: preJoinParamPrefix is required when preJoinFilters are present (alias='${alias}')`
      );
    }
    const paramPrefix = preJoinParamPrefix ?? '';
    const qualifyForRawCte: ColumnRefResolver = column => this.dialect.quoteFieldRef(column);
    const where =
      preJoinFilters?.length && renderer
        ? renderer.renderWhere(preJoinFilters, qualifyForRawCte, paramPrefix, resolveColumnType)
        : { sql: '', params: [] as SqlParameter[] };

    // Re-indent every line of the WHERE (it can be multi-line: `WHERE …\n  AND …`)
    // so it nests under this CTE's 4-space SELECT/FROM block.
    const indentedWhere = where.sql ? where.sql.replace(/\n/g, '\n    ') : '';

    // An unpartitioned window is computed over the ENTIRE joined mart in one partition — a
    // single-worker sort that reliably blows up on a large table. Partitioning by the chain's
    // parent-join key bounds each window to one key group, which is all the value sleeve needs
    // (it dedups per key, carrying that key in the DISTINCT tuple). Falls back to the
    // unpartitioned form only for a keyless chain.
    const partitionRefs = (rowSurrogatePartitionColumns ?? []).map(c =>
      this.dialect.quoteFieldRef(c)
    );
    const rowSurrogateProjection = includeRowSurrogate
      ? `${this.dialect.buildRowSurrogate(partitionRefs)} AS ${this.dialect.quoteIdentifier(ROW_SURROGATE_ALIAS)}`
      : undefined;

    const body = safeForExplicitProjection
      ? `${header}    SELECT\n      ${[...columns.map(c => this.dialect.quoteIdentifier(c)), ...(rowSurrogateProjection ? [rowSurrogateProjection] : [])].join(',\n      ')}\n    FROM ${tableReference}`
      : `${header}    SELECT *${rowSurrogateProjection ? `, ${rowSurrogateProjection}` : ''} FROM ${tableReference}`;

    return { sql: `${body}${indentedWhere}\n  )`, params: where.params };
  }

  collectMainReferences(
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

  collectSubsidiaryReferences(
    chain: ResolvedRelationshipChain,
    children: BlendTreeNode[],
    preJoinColumns: ReadonlySet<string>,
    // A declared key is frequently referenced by nothing else — neither a join key nor a
    // selected field — so the sleeve's dedup columns must be projected explicitly.
    identityColumns: readonly string[] = []
  ): string[] {
    const refs = new Set<string>();
    for (const jc of chain.relationship.joinConditions) refs.add(jc.targetFieldName);
    for (const field of chain.blendedFields) refs.add(field.targetFieldName);
    for (const child of children) {
      for (const jc of child.chain.relationship.joinConditions) refs.add(jc.sourceFieldName);
    }
    for (const col of preJoinColumns) refs.add(col);
    for (const col of identityColumns) refs.add(col);
    return Array.from(refs).sort();
  }

  buildAggregationCte(
    chain: ResolvedRelationshipChain,
    hasChildren: boolean,
    passthroughFields: PassthroughField[]
  ): string {
    const { relationship, blendedFields, cteName } = chain;
    const alias = this.dialect.quoteIdentifier(cteName);
    const sourceAlias = hasChildren
      ? this.dialect.quoteIdentifier(`${cteName}_joined`)
      : this.dialect.quoteIdentifier(`${cteName}_raw`);

    const parentJoinKeys = relationship.joinConditions.map(jc =>
      this.dialect.quoteFieldRef(jc.targetFieldName)
    );

    const groupByKeys = [...parentJoinKeys];

    const aggregatedParts = blendedFields.map(field => {
      const aggregated = this.dialect.buildAggregation(
        preJoinAggregateFunctionFor(field.aggregateFunction, field.targetFieldType),
        this.dialect.quoteFieldRef(field.targetFieldName)
      );
      return `${aggregated} AS ${this.dialect.quoteIdentifier(field.outputAlias)}`;
    });

    const passthroughParts = passthroughFields.map(pt => {
      const reAggFunc = reAggregateFunctionFor(pt.aggregateFunction);
      const aggregated = this.dialect.buildAggregation(
        reAggFunc,
        this.dialect.quoteIdentifier(pt.outputAlias)
      );
      return `${aggregated} AS ${this.dialect.quoteIdentifier(pt.outputAlias)}`;
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

  buildSelectParts(
    columnSet: Set<string>,
    outputAliasToRoot: Map<string, string>,
    hiddenOutputAliases: Set<string>
  ): string[] {
    const parts: string[] = [];
    for (const col of columnSet) {
      const rootAlias = outputAliasToRoot.get(col);
      if (rootAlias && !hiddenOutputAliases.has(col)) {
        parts.push(
          `${this.dialect.quoteIdentifier(rootAlias)}.${this.dialect.quoteIdentifier(col)}`
        );
      } else {
        parts.push(`${this.dialect.quoteIdentifier('main')}.${this.dialect.quoteFieldRef(col)}`);
      }
    }
    return parts;
  }

  mapOutputAliasesToRoot(
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

  buildJoinParts(roots: BlendTreeNode[]): string[] {
    return roots.map(root => {
      const { relationship, parentAlias, cteName } = root.chain;
      return renderLeftJoinOn(this.dialect, {
        leftAlias: parentAlias,
        rightAlias: cteName,
        joinConditions: relationship.joinConditions,
      });
    });
  }
}
