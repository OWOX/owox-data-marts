import {
  BlendedQueryBuilder,
  BlendedQueryContext,
  ResolvedRelationshipChain,
} from './blended-query-builder.interface';
import { DataStorageType } from '../enums/data-storage-type.enum';

/**
 * Base class for blended SQL query builders.
 *
 * Produces CTE-based SQL following the "Gold Layer SQL Best Practices":
 *
 * ```sql
 * WITH
 *   -- <Main Data Mart Title>
 *   -- <Main Data Mart URL>
 *   main AS (
 *     SELECT * FROM <mainTableReference>
 *   ),
 *
 *   -- <Subsidiary Data Mart Title>
 *   -- <Subsidiary Data Mart URL>
 *   <alias>_raw AS (
 *     SELECT * FROM <targetTableReference>
 *   ),
 *
 *   <alias> AS (
 *     SELECT
 *       <joinKeys>,
 *       <aggregated> AS <outputAlias>
 *     FROM <alias>_raw
 *     GROUP BY <joinKeys>
 *   )
 *
 * SELECT
 *   main.<col>,
 *   <alias>.<outputAlias>
 * FROM main
 * LEFT JOIN <alias> ON main.<sourceField> = <alias>.<targetField>
 * ```
 *
 * Rules enforced here (see `.claude/sql-requirements.md`):
 * - Every source is wrapped in a CTE at the top
 * - Raw source CTEs come first, aggregation CTEs follow
 * - Each source CTE is preceded by a comment with the data mart title and URL
 * - Raw CTEs contain no aggregations — aggregations live in dedicated CTEs
 * - The final SELECT/JOINs reference only aliases defined in the WITH clause
 * - Column references are qualified (e.g. `main.customer_name`) but carry no
 *   inline aliases, per spec rule "No need to add aliases in SELECT for sources
 *   defined in WITH"
 *
 * Subclasses only need to override `buildAggregation` to provide
 * dialect-specific aggregate expressions (STRING_AGG is the only function
 * that differs between dialects today).
 */
export abstract class AbstractBlendedQueryBuilder implements BlendedQueryBuilder {
  abstract readonly type: DataStorageType;

  buildBlendedQuery(context: BlendedQueryContext): string {
    const { mainTableReference, mainDataMartTitle, mainDataMartUrl, chains, columns } = context;
    const columnSet = new Set(columns);

    const cteBlocks: string[] = [];

    // 1. Raw CTE for main data mart
    cteBlocks.push(
      this.buildRawCte('main', mainTableReference, mainDataMartTitle, mainDataMartUrl)
    );

    // 2. Raw CTEs for each subsidiary (all raw reads first, before any aggregations)
    for (const chain of chains) {
      const rawAlias = `${chain.relationship.targetAlias}_raw`;
      cteBlocks.push(
        this.buildRawCte(
          rawAlias,
          chain.targetTableReference,
          chain.targetDataMartTitle,
          chain.targetDataMartUrl
        )
      );
    }

    // 3. Aggregation CTEs — one per subsidiary, reading from its raw CTE
    for (const chain of chains) {
      cteBlocks.push(this.buildAggregationCte(chain));
    }

    const withClause = `WITH\n${cteBlocks.join(',\n\n')}`;

    const selectParts = this.buildSelectParts(chains, columnSet);
    const joinParts = this.buildJoinParts(chains);
    const selectClause = selectParts.length > 0 ? selectParts.join(',\n  ') : '*';

    const body =
      `SELECT\n  ${selectClause}\nFROM main` +
      (joinParts.length > 0 ? '\n' + joinParts.join('\n') : '');

    return `${withClause}\n\n${body}`;
  }

  private buildRawCte(alias: string, tableReference: string, title: string, url: string): string {
    return (
      `  -- ${title}\n` +
      `  -- ${url}\n` +
      `  ${alias} AS (\n` +
      `    SELECT * FROM ${tableReference}\n` +
      `  )`
    );
  }

  private buildAggregationCte(chain: ResolvedRelationshipChain): string {
    const { relationship, blendedFields } = chain;
    const alias = relationship.targetAlias;
    const rawAlias = `${alias}_raw`;
    const joinKeys = relationship.joinConditions.map(jc => jc.targetFieldName);

    const aggregatedParts = blendedFields.map(field => {
      const aggregated = this.buildAggregation(field.aggregateFunction, field.targetFieldName);
      return `${aggregated} AS ${field.outputAlias}`;
    });

    const selectItems = [...joinKeys, ...aggregatedParts];

    return (
      `  ${alias} AS (\n` +
      `    SELECT\n` +
      `      ${selectItems.join(',\n      ')}\n` +
      `    FROM ${rawAlias}\n` +
      `    GROUP BY ${joinKeys.join(', ')}\n` +
      `  )`
    );
  }

  private buildSelectParts(chains: ResolvedRelationshipChain[], columnSet: Set<string>): string[] {
    const parts: string[] = [];

    // Columns that don't belong to any subsidiary alias are assumed to be from main
    const allSubsidiaryOutputAliases = new Set<string>();
    for (const chain of chains) {
      for (const field of chain.blendedFields) {
        if (!field.isHidden) {
          allSubsidiaryOutputAliases.add(field.outputAlias);
        }
      }
    }

    for (const col of columnSet) {
      if (allSubsidiaryOutputAliases.has(col)) {
        const ownerChain = chains.find(c =>
          c.blendedFields.some(f => f.outputAlias === col && !f.isHidden)
        );
        if (ownerChain) {
          parts.push(`${ownerChain.relationship.targetAlias}.${col}`);
        }
      } else {
        parts.push(`main.${col}`);
      }
    }

    return parts;
  }

  private buildJoinParts(chains: ResolvedRelationshipChain[]): string[] {
    return chains.map(chain => {
      const { relationship, parentAlias } = chain;
      const alias = relationship.targetAlias;

      const onParts = relationship.joinConditions.map(
        jc => `${parentAlias}.${jc.sourceFieldName} = ${alias}.${jc.targetFieldName}`
      );
      const onClause = onParts.join(' AND ');

      return `LEFT JOIN ${alias} ON ${onClause}`;
    });
  }

  /**
   * Dialect-specific aggregate expression for a column.
   * Subclasses override to provide STRING_AGG/LISTAGG/ARRAY_JOIN etc.
   */
  protected abstract buildAggregation(aggregateFunction: string, fieldName: string): string;
}
