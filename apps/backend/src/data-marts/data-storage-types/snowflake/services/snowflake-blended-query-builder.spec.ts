import { Test, TestingModule } from '@nestjs/testing';
import { DataMartRelationship } from '../../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  BlendedQueryContext,
  ResolvedRelationshipChain,
} from '../../interfaces/blended-query-builder.interface';
import { SnowflakeBlendedQueryBuilder } from './snowflake-blended-query-builder';

function makeRelationship(overrides: Partial<DataMartRelationship> = {}): DataMartRelationship {
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

function makeChain(
  partial: Omit<ResolvedRelationshipChain, 'targetDataMartTitle' | 'targetDataMartUrl'>
): ResolvedRelationshipChain {
  return {
    ...partial,
    targetDataMartTitle: 'Test Subsidiary',
    targetDataMartUrl: '/ui/proj/data-marts/sub-1/data-setup',
  };
}

function buildContext(chains: ResolvedRelationshipChain[], columns: string[]): BlendedQueryContext {
  return {
    mainTableReference: 'mydb."myschema"."customers"',
    mainDataMartTitle: 'Test Main',
    mainDataMartUrl: '/ui/proj/data-marts/main-1/data-setup',
    chains,
    columns,
  };
}

describe('SnowflakeBlendedQueryBuilder', () => {
  let builder: SnowflakeBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SnowflakeBlendedQueryBuilder],
    }).compile();

    builder = module.get(SnowflakeBlendedQueryBuilder);
  });

  it('should have type SNOWFLAKE', () => {
    expect(builder.type).toBe(DataStorageType.SNOWFLAKE);
  });

  it("uses LISTAGG(CAST(field AS VARCHAR), ', ') for STRING_AGG aggregation", () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: 'mydb."myschema"."orders"',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'order_name',
          outputAlias: 'order_names',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });

    const sql = builder.buildBlendedQuery(buildContext([chain], ['order_names']));

    expect(sql).toContain("LISTAGG(CAST(order_name AS VARCHAR), ', ') AS order_names");
    expect(sql).not.toContain('STRING_AGG');
    expect(sql).not.toContain('ARRAY_JOIN');
    expect(sql).not.toContain('COLLECT_LIST');
  });

  it('uses COUNT(DISTINCT field) for COUNT_DISTINCT aggregation', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: 'mydb."myschema"."orders"',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'customer_id',
          outputAlias: 'unique_customers',
          isHidden: false,
          aggregateFunction: 'COUNT_DISTINCT',
        },
      ],
    });

    const sql = builder.buildBlendedQuery(buildContext([chain], ['unique_customers']));

    expect(sql).toContain('COUNT(DISTINCT customer_id) AS unique_customers');
  });

  it('uses " (double-quote) quoting for identifiers', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: "Product's",
        joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
      }),
      targetTableReference: 'mydb."myschema"."products"',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'name',
          outputAlias: 'product_names',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });

    const sql = builder.buildBlendedQuery(buildContext([chain], ['product_names']));

    expect(sql).toContain('"Product\'s_raw" AS (');
    expect(sql).toContain('"Product\'s" AS (');
    // Double-quotes, not backticks
    expect(sql).not.toMatch(/`Product's`/);
  });

  it('uses COUNT function correctly', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: 'mydb."myschema"."orders"',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'order_id',
          outputAlias: 'order_count',
          isHidden: false,
          aggregateFunction: 'COUNT',
        },
      ],
    });

    const sql = builder.buildBlendedQuery(buildContext([chain], ['order_count']));

    expect(sql).toContain('COUNT(order_id) AS order_count');
  });
});
