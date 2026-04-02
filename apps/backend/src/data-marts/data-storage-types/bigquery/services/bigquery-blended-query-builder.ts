import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  BlendedQueryBuilder,
  ResolvedRelationshipChain,
} from '../../interfaces/blended-query-builder.interface';

@Injectable()
export class BigQueryBlendedQueryBuilder implements BlendedQueryBuilder {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  buildBlendedQuery(
    mainTableReference: string,
    chains: ResolvedRelationshipChain[],
    columns: string[]
  ): string {
    const columnSet = new Set(columns);

    const selectParts = this.buildSelectParts(chains, columnSet);
    const joinParts = this.buildJoinParts(chains);

    const selectClause = selectParts.length > 0 ? selectParts.join(',\n  ') : '*';

    return (
      `SELECT\n  ${selectClause}\nFROM ${mainTableReference} AS main` +
      (joinParts.length > 0 ? '\n' + joinParts.join('\n') : '')
    );
  }

  private buildSelectParts(chains: ResolvedRelationshipChain[], columnSet: Set<string>): string[] {
    const parts: string[] = [];

    // Columns that don't belong to any subsidiary alias are assumed to be from main
    const allSubsidiaryOutputAliases = new Set<string>();
    for (const chain of chains) {
      for (const field of chain.relationship.blendedFields) {
        if (!field.isHidden) {
          allSubsidiaryOutputAliases.add(field.outputAlias);
        }
      }
    }

    for (const col of columnSet) {
      if (allSubsidiaryOutputAliases.has(col)) {
        // find which chain owns this output alias
        const ownerChain = chains.find(c =>
          c.relationship.blendedFields.some(f => f.outputAlias === col && !f.isHidden)
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
      const { relationship, targetTableReference, parentAlias } = chain;
      const alias = relationship.targetAlias;
      const joinKeys = relationship.joinConditions.map(jc => jc.targetFieldName);

      // Build pre-aggregation subquery
      const subquerySelectParts: string[] = [
        ...joinKeys,
        ...relationship.blendedFields.map(field => {
          const aggregated = this.buildAggregation(field.aggregateFunction, field.targetFieldName);
          return `${aggregated} AS ${field.outputAlias}`;
        }),
      ];

      const subquery =
        `(\n` +
        `    SELECT\n` +
        `      ${subquerySelectParts.join(',\n      ')}\n` +
        `    FROM ${targetTableReference}\n` +
        `    GROUP BY ${joinKeys.join(', ')}\n` +
        `  )`;

      // Build ON clause
      const onParts = relationship.joinConditions.map(
        jc => `${parentAlias}.${jc.sourceFieldName} = ${alias}.${jc.targetFieldName}`
      );
      const onClause = onParts.join(' AND ');

      return `LEFT JOIN ${subquery} AS ${alias} ON ${onClause}`;
    });
  }

  private buildAggregation(aggregateFunction: string, fieldName: string): string {
    switch (aggregateFunction) {
      case 'STRING_AGG':
        return `STRING_AGG(CAST(${fieldName} AS STRING), ', ')`;
      case 'COUNT':
        return `COUNT(${fieldName})`;
      default:
        return `${aggregateFunction}(${fieldName})`;
    }
  }
}
