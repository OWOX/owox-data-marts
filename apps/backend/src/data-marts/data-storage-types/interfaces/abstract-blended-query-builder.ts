import {
  BlendedQueryBuilder,
  BlendedQueryContext,
  ResolvedRelationshipChain,
} from './blended-query-builder.interface';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { AggregateFunction } from '../../dto/schemas/aggregate-function.schema';

interface BlendTreeNode {
  chain: ResolvedRelationshipChain;
  children: BlendTreeNode[];
}

// `title`/`url` flow into single-line SQL comments inside generated queries;
// embedded newlines would close the comment and expose the rest of the input as
// executable SQL, so strip any line break or additional comment marker.
function sanitizeSqlComment(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/--/g, '—')
    .trim();
}

/**
 * Tracks a blended field flowing upward through the tree during bottom-up
 * aggregation. At the leaf level this is the original field; at each
 * intermediate level the aggregated result is re-aggregated using
 * {@link getReAggregateFunction}.
 */
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

  /**
   * The quoting character this dialect uses for identifiers (BigQuery/Databricks
   * use backticks; Snowflake/Redshift/Athena use double quotes). Subclasses
   * provide this so the abstract builder can safely emit user-controlled names
   * (aliases, column names with apostrophes/spaces, reserved keywords, etc.)
   * without breaking the generated SQL.
   */
  protected abstract get identifierQuoteChar(): string;

  buildBlendedQuery(context: BlendedQueryContext): string {
    const { mainTableReference, mainDataMartTitle, mainDataMartUrl, chains, columns } = context;
    const columnSet = new Set(columns);

    const cteBlocks: string[] = [];

    // 1. Raw CTE for main data mart — projects only the columns actually referenced.
    const roots = this.buildTree(chains);
    const mainColumns = this.collectMainReferences(roots, columnSet);
    cteBlocks.push(
      this.buildRawCte('main', mainTableReference, mainDataMartTitle, mainDataMartUrl, mainColumns)
    );

    // 2. Bottom-up CTEs for each subtree rooted at a direct child of main.
    //    Post-order traversal ensures leaf CTEs come first.
    for (const root of roots) {
      const { ctes } = this.buildSubtreeCtes(root);
      cteBlocks.push(...ctes);
    }

    const withClause = `WITH\n${cteBlocks.join(',\n\n')}`;

    const selectParts = this.buildSelectParts(roots, columnSet);
    const joinParts = this.buildJoinParts(roots);
    const selectClause = selectParts.length > 0 ? selectParts.join(',\n  ') : '*';

    const body =
      `SELECT\n  ${selectClause}\nFROM main` +
      (joinParts.length > 0 ? '\n' + joinParts.join('\n') : '');

    return `${withClause}\n\n${body}`;
  }

  /**
   * Wraps a single identifier (CTE alias, column alias, single-segment column
   * name) in dialect-specific quotes only when needed — names that already
   * match `[A-Za-z_][A-Za-z0-9_]*` stay unquoted to keep the generated SQL
   * readable. The quote character itself is escaped by doubling, the standard
   * SQL convention across all supported dialects.
   */
  protected quoteIdentifier(name: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
    const q = this.identifierQuoteChar;
    return `${q}${name.split(q).join(q + q)}${q}`;
  }

  /**
   * Quotes a (possibly dotted) column reference, treating each segment
   * independently. `user.email` becomes e.g. `` `user`.`email` `` — required
   * for nested struct fields in BigQuery — while a flat `Product's_id` becomes
   * `` `Product's_id` ``.
   */
  protected quoteFieldRef(ref: string): string {
    return ref
      .split('.')
      .map(seg => this.quoteIdentifier(seg))
      .join('.');
  }

  /**
   * Converts the flat sorted `chains` array into a forest of trees where
   * root nodes are chains with `parentAlias === 'main'`.
   */
  private buildTree(chains: ResolvedRelationshipChain[]): BlendTreeNode[] {
    const nodeMap = new Map<string, BlendTreeNode>();
    for (const chain of chains) {
      nodeMap.set(chain.relationship.targetAlias, { chain, children: [] });
    }
    const roots: BlendTreeNode[] = [];
    for (const chain of chains) {
      const node = nodeMap.get(chain.relationship.targetAlias)!;
      if (chain.parentAlias === 'main') {
        roots.push(node);
      } else {
        const parentNode = nodeMap.get(chain.parentAlias);
        if (parentNode) parentNode.children.push(node);
      }
    }
    return roots;
  }

  /**
   * Recursively builds CTEs for a subtree using post-order (bottom-up)
   * traversal. Returns the CTE blocks and the list of output columns
   * (passthrough fields) that this subtree exposes after aggregation.
   */
  private buildSubtreeCtes(node: BlendTreeNode): {
    ctes: string[];
    passthroughFields: PassthroughField[];
  } {
    const ctes: string[] = [];

    // 1. Recurse into children first (post-order)
    const childPassthroughs = new Map<string, PassthroughField[]>();
    for (const child of node.children) {
      const childResult = this.buildSubtreeCtes(child);
      ctes.push(...childResult.ctes);
      childPassthroughs.set(child.chain.relationship.targetAlias, childResult.passthroughFields);
    }

    const { chain } = node;
    const alias = chain.relationship.targetAlias;

    // 2. Raw CTE for this node
    const subsidiaryColumns = this.collectSubsidiaryReferences(chain, node.children);
    ctes.push(
      this.buildRawCte(
        `${alias}_raw`,
        chain.targetTableReference,
        chain.targetDataMartTitle,
        chain.targetDataMartUrl,
        subsidiaryColumns
      )
    );

    // 3. If this node has children, emit a _joined CTE
    const hasChildren = node.children.length > 0;
    if (hasChildren) {
      ctes.push(this.buildJoinedCte(node, childPassthroughs));
    }

    // 4. Aggregation CTE — groups by parent join keys only
    const allPassthroughFields = this.collectAllPassthroughs(childPassthroughs);
    ctes.push(this.buildAggregationCte(chain, hasChildren, allPassthroughFields));

    // 5. Compute passthrough fields for the parent level:
    //    own blended fields + re-mapped child passthrough fields
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

    return { ctes, passthroughFields };
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

  /**
   * Builds the `{alias}_joined` CTE that LEFT JOINs a node's raw data with
   * all of its children's aggregated CTEs.
   */
  private buildJoinedCte(
    node: BlendTreeNode,
    childPassthroughs: Map<string, PassthroughField[]>
  ): string {
    const { chain } = node;
    const alias = chain.relationship.targetAlias;
    const rawAlias = `${alias}_raw`;
    const joinedAlias = `${alias}_joined`;
    const quotedRawAlias = this.quoteIdentifier(rawAlias);
    const quotedJoinedAlias = this.quoteIdentifier(joinedAlias);

    // SELECT columns: parent join keys + own blended fields from raw, then child outputs
    const selectParts: string[] = [];

    // Parent join keys from raw
    for (const jc of chain.relationship.joinConditions) {
      selectParts.push(`${quotedRawAlias}.${this.quoteFieldRef(jc.targetFieldName)}`);
    }

    // Own blended field columns from raw
    const seen = new Set(selectParts);
    for (const field of chain.blendedFields) {
      const ref = `${quotedRawAlias}.${this.quoteFieldRef(field.targetFieldName)}`;
      if (!seen.has(ref)) {
        seen.add(ref);
        selectParts.push(ref);
      }
    }

    // Child aggregated outputs + JOIN clauses (single pass over children)
    const joinClauses: string[] = [];
    for (const child of node.children) {
      const childAlias = child.chain.relationship.targetAlias;
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
    columns: string[]
  ): string {
    // Fall back to `*` when no explicit columns are known or any column uses
    // dot-notation (BigQuery nested struct path) — projecting `user.email`
    // directly would rename it to `email`, breaking downstream references.
    const safeForExplicitProjection = columns.length > 0 && columns.every(c => !c.includes('.'));
    const safeTitle = sanitizeSqlComment(title);
    const safeUrl = sanitizeSqlComment(url);
    const header = `  -- ${safeTitle}\n  -- ${safeUrl}\n  ${this.quoteIdentifier(alias)} AS (\n`;
    if (!safeForExplicitProjection) {
      return `${header}    SELECT * FROM ${tableReference}\n  )`;
    }
    const projection = columns.map(c => this.quoteIdentifier(c)).join(',\n      ');
    return `${header}    SELECT\n      ${projection}\n    FROM ${tableReference}\n  )`;
  }

  /**
   * Columns of the main DM that need to be projected in its raw CTE:
   *  - native columns from the user's `columnConfig` (everything in `columnSet`
   *    that is not the outputAlias of a non-hidden subsidiary blended field)
   *  - join keys used by root-level (direct children of main) chains
   */
  private collectMainReferences(roots: BlendTreeNode[], columnSet: Set<string>): string[] {
    const subsidiaryOutputAliases = this.collectAllOutputAliases(roots);

    const refs = new Set<string>();
    for (const col of columnSet) {
      if (!subsidiaryOutputAliases.has(col)) refs.add(col);
    }
    for (const root of roots) {
      for (const jc of root.chain.relationship.joinConditions) refs.add(jc.sourceFieldName);
    }
    return Array.from(refs).sort();
  }

  /**
   * Recursively collects all non-hidden outputAlias values from a tree.
   * In bottom-up mode, deep blended fields are surfaced through root nodes,
   * so we need to traverse the entire tree.
   */
  private collectAllOutputAliases(nodes: BlendTreeNode[]): Set<string> {
    const result = new Set<string>();
    for (const node of nodes) {
      for (const field of node.chain.blendedFields) {
        if (!field.isHidden) result.add(field.outputAlias);
      }
      const childAliases = this.collectAllOutputAliases(node.children);
      for (const alias of childAliases) result.add(alias);
    }
    return result;
  }

  /**
   * Columns of a subsidiary DM that need to be projected in its raw CTE:
   *  - join keys this subsidiary uses to join to its parent (targetFieldName)
   *  - aggregated columns (blendedFields.targetFieldName)
   *  - join keys used by children (sourceFieldName — needed for the _joined CTE)
   */
  private collectSubsidiaryReferences(
    chain: ResolvedRelationshipChain,
    children: BlendTreeNode[]
  ): string[] {
    const refs = new Set<string>();
    for (const jc of chain.relationship.joinConditions) refs.add(jc.targetFieldName);
    for (const field of chain.blendedFields) refs.add(field.targetFieldName);
    for (const child of children) {
      for (const jc of child.chain.relationship.joinConditions) refs.add(jc.sourceFieldName);
    }
    return Array.from(refs).sort();
  }

  /**
   * Builds the aggregation CTE for a single node. Groups by parent join keys
   * ONLY — child join keys are no longer needed because downstream joins happen
   * inside the `_joined` CTE, not in the final FROM/JOIN clause.
   *
   * For intermediate nodes (hasChildren=true), the source is the `_joined` CTE
   * and passthrough fields from children are re-aggregated. For leaf nodes,
   * the source is the `_raw` CTE.
   */
  private buildAggregationCte(
    chain: ResolvedRelationshipChain,
    hasChildren: boolean,
    passthroughFields: PassthroughField[]
  ): string {
    const { relationship, blendedFields } = chain;
    const alias = this.quoteIdentifier(relationship.targetAlias);
    const sourceAlias = hasChildren
      ? this.quoteIdentifier(`${relationship.targetAlias}_joined`)
      : this.quoteIdentifier(`${relationship.targetAlias}_raw`);

    // Keys this subsidiary uses to join to its parent — always grouped on.
    const parentJoinKeys = relationship.joinConditions.map(jc =>
      this.quoteFieldRef(jc.targetFieldName)
    );

    const groupByKeys = [...parentJoinKeys];

    // Own blended field aggregations
    const aggregatedParts = blendedFields.map(field => {
      const aggregated = this.buildAggregation(
        field.aggregateFunction,
        this.quoteFieldRef(field.targetFieldName)
      );
      return `${aggregated} AS ${this.quoteIdentifier(field.outputAlias)}`;
    });

    // Passthrough fields from children — re-aggregated
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

  /**
   * Final SELECT: references main columns and blended columns from root-level
   * aggregation CTEs only. Deep blended fields are surfaced through root nodes
   * via re-aggregation.
   */
  private buildSelectParts(roots: BlendTreeNode[], columnSet: Set<string>): string[] {
    const parts: string[] = [];

    // Build a map: outputAlias → root alias that surfaces it.
    // Non-hidden blended fields from any depth are routed to their root ancestor.
    const outputAliasToRoot = new Map<string, string>();
    for (const root of roots) {
      this.mapOutputAliasesToRoot(root, root.chain.relationship.targetAlias, outputAliasToRoot);
    }

    for (const col of columnSet) {
      const rootAlias = outputAliasToRoot.get(col);
      if (rootAlias) {
        parts.push(`${this.quoteIdentifier(rootAlias)}.${this.quoteIdentifier(col)}`);
      } else {
        parts.push(`main.${this.quoteIdentifier(col)}`);
      }
    }

    return parts;
  }

  /**
   * Recursively maps every non-hidden outputAlias in a subtree to the root
   * alias that will surface it after bottom-up aggregation.
   */
  private mapOutputAliasesToRoot(
    node: BlendTreeNode,
    rootAlias: string,
    result: Map<string, string>
  ): void {
    for (const field of node.chain.blendedFields) {
      if (!field.isHidden) result.set(field.outputAlias, rootAlias);
    }
    for (const child of node.children) {
      this.mapOutputAliasesToRoot(child, rootAlias, result);
    }
  }

  /**
   * Final JOINs: only root-level nodes (direct children of main) are LEFT
   * JOINed to main. Deeper joins happen inside `_joined` CTEs.
   */
  private buildJoinParts(roots: BlendTreeNode[]): string[] {
    return roots.map(root => {
      const { relationship, parentAlias } = root.chain;
      const alias = this.quoteIdentifier(relationship.targetAlias);
      const parent = this.quoteIdentifier(parentAlias);

      const onParts = relationship.joinConditions.map(
        jc =>
          `${parent}.${this.quoteFieldRef(jc.sourceFieldName)} = ${alias}.${this.quoteFieldRef(jc.targetFieldName)}`
      );
      const onClause = onParts.join(' AND ');

      return `LEFT JOIN ${alias} ON ${onClause}`;
    });
  }

  /**
   * Maps an aggregate function to the function used when re-aggregating an
   * already-aggregated value at a higher tree level. SUM-of-SUMs and
   * MAX-of-MAXes stay idempotent; COUNT and COUNT_DISTINCT become SUM
   * (distinct-sum across parent groups is approximate — same caveat as COUNT);
   * ANY_VALUE becomes MAX (safe across all dialects).
   */
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

  /**
   * Must wrap `fieldName` in a CAST to the dialect's native string type so
   * non-string inputs don't raise runtime errors.
   */
  protected abstract buildStringAgg(fieldName: string): string;
}
