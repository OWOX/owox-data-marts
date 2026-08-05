import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../abstract-blended-query-builder';
import { BigQueryClauseRenderer } from '../../bigquery/services/bigquery-clause-renderer';
import { SleeveResult } from '../../blending/blended-query.types';
import { MetricSleeveBuilder } from '../../blending/metric-sleeve.builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { buildBlendedFieldIndex } from '../../../services/blended-field-index';
import { DataMartRelationship } from '../../../entities/data-mart-relationship.entity';
import { BlendedQueryContext, ResolvedRelationshipChain } from '../blended-query-builder.interface';

export function makeRelationship(
  overrides: Partial<DataMartRelationship> = {}
): DataMartRelationship {
  return {
    id: 'rel-1',
    targetAlias: 'orders',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
    blendedFields: [],
    projectId: 'proj',
    createdById: 'user-1',
    createdAt: new Date(),
    modifiedAt: new Date(),
    ...overrides,
  } as DataMartRelationship;
}

export function makeChain(
  partial: Omit<
    ResolvedRelationshipChain,
    'targetDataMartTitle' | 'targetDataMartUrl' | 'cteName'
  > & {
    cteName?: string;
  }
): ResolvedRelationshipChain {
  const cteName =
    partial.cteName ??
    (partial.parentAlias === 'main'
      ? partial.relationship.targetAlias
      : `${partial.parentAlias}_${partial.relationship.targetAlias}`);
  return {
    ...partial,
    cteName,
    targetDataMartTitle: 'Test Subsidiary',
    targetDataMartUrl: '/ui/proj/data-marts/sub-1/data-setup',
  };
}

export function createBuildContext(mainTableReference: string) {
  return (chains: ResolvedRelationshipChain[], columns: string[]): BlendedQueryContext => ({
    mainTableReference,
    mainDataMartTitle: 'Test Main',
    mainDataMartUrl: '/ui/proj/data-marts/main-1/data-setup',
    chains,
    columns,
  });
}

// Uses backtick quoting and a plain STRING_AGG syntax (no CAST) so that SQL-shape
// assertions stay readable — dialect-specific CASTs are covered by per-dialect specs.
export class TestBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  // sleeve SQL now lives in MetricSleeveBuilder. Expose the dialect-bound instance so
  // these tests can still exercise a single sleeve CTE in isolation.
  sleeves(): MetricSleeveBuilder {
    return this.createSleeveBuilder();
  }

  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  protected get identifierQuoteChar() {
    return '`';
  }
  protected get clauseRenderer(): SqlClauseRenderer | null {
    return null;
  }
  protected buildStringAgg(fieldName: string): string {
    return `STRING_AGG(${fieldName})`;
  }
}

export class TestBlendedWithRenderer extends AbstractBlendedQueryBuilder {
  // sleeve SQL now lives in MetricSleeveBuilder. Expose the dialect-bound instance so
  // these tests can still exercise a single sleeve CTE in isolation.
  sleeves(): MetricSleeveBuilder {
    return this.createSleeveBuilder();
  }

  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  protected get identifierQuoteChar() {
    return '`';
  }
  protected get clauseRenderer() {
    return new BigQueryClauseRenderer();
  }
  protected buildStringAgg(fieldName: string): string {
    return `STRING_AGG(${fieldName})`;
  }
}

/**
 * A builder whose sleeves are deliberately corrupted after the real ones are built.
 *
 * `buildBlendedQuery` asserts that a sleeve's join-back keys match the outer GROUP BY exactly —
 * including the direction the code calls "the DANGEROUS one", where a sleeve at a COARSER grain
 * spreads one value across several outer groups through ANY_VALUE, producing a plausible number
 * with no NULL and no error. By construction the real sleeve builder cannot produce that drift,
 * so the only way to exercise the guards is to introduce it on purpose.
 */
export class TestBlendedWithDriftedSleeve extends TestBlendedWithRenderer {
  constructor(private readonly drift: (sleeve: SleeveResult) => SleeveResult) {
    super();
  }

  protected createSleeveBuilder(): MetricSleeveBuilder {
    const builder = super.createSleeveBuilder();
    const buildAll = builder.buildAll.bind(builder);
    builder.buildAll = (...args: Parameters<MetricSleeveBuilder['buildAll']>) =>
      buildAll(...args).map(this.drift);
    return builder;
  }
}

// main -> organizations (main.org_id = organizations_raw.orgId)
// main -> users         (main.user_id = users_raw.userId)
// dim: users__country · metric: organizations__orgId (COUNT_DISTINCT)
/** The context factory the blended-builder specs share (main data mart = `main_table`). */
const buildContext = createBuildContext('main_table');

/**
 * Collapses indentation/newlines so multi-line CTE SQL can be asserted against with simple
 * substring checks, independent of the builder's exact line-wrapping.
 */
export function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

export function fixtureEventsUsersOrgs(): {
  context: BlendedQueryContext;
  outputAliasToRoot: ReadonlyMap<string, string>;
} {
  const organizationsChain = makeChain({
    relationship: makeRelationship({
      id: 'rel-organizations',
      targetAlias: 'organizations',
      joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'orgId' }],
    }),
    targetTableReference: 'organizations_table',
    parentAlias: 'main',
    blendedFields: [
      {
        targetFieldName: 'orgId',
        outputAlias: 'organizations__orgId',
        isHidden: false,
        aggregateFunction: 'ANY_VALUE',
      },
    ],
  });
  const usersChain = makeChain({
    relationship: makeRelationship({
      id: 'rel-users',
      targetAlias: 'users',
      joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'userId' }],
    }),
    targetTableReference: 'users_table',
    parentAlias: 'main',
    blendedFields: [
      {
        targetFieldName: 'country',
        outputAlias: 'users__country',
        isHidden: false,
        aggregateFunction: 'ANY_VALUE',
      },
    ],
  });

  const fieldIndex = buildBlendedFieldIndex({
    blendedFields: [
      {
        name: 'organizations__orgId',
        aliasPath: 'organizations',
        originalFieldName: 'orgId',
        type: 'STRING',
      },
      // Second blended column on the SAME chain — for the CTE-name collision test.
      {
        name: 'organizations__name',
        aliasPath: 'organizations',
        originalFieldName: 'name',
        type: 'STRING',
      },
      {
        name: 'users__country',
        aliasPath: 'users',
        originalFieldName: 'country',
        type: 'STRING',
      },
    ],
    availableSources: [
      { aliasPath: 'organizations', isIncluded: true },
      { aliasPath: 'users', isIncluded: true },
    ],
  } as never);

  const outputAliasToRoot = new Map([
    ['organizations__orgId', 'organizations'],
    ['organizations__name', 'organizations'],
    ['users__country', 'users'],
  ]);

  const context: BlendedQueryContext = {
    ...buildContext([organizationsChain, usersChain], ['users__country', 'organizations__orgId']),
    fieldIndex,
  };

  return { context, outputAliasToRoot };
}
