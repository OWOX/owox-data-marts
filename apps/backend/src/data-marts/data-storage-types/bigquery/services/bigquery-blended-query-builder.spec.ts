import { Test, TestingModule } from '@nestjs/testing';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { BigQueryBlendedQueryBuilder } from './bigquery-blended-query-builder';

const buildContext = createBuildContext('`project`.`dataset`.`customers`');

describe('BigQueryBlendedQueryBuilder', () => {
  let builder: BigQueryBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BigQueryBlendedQueryBuilder],
    }).compile();

    builder = module.get(BigQueryBlendedQueryBuilder);
  });

  it('should have type GOOGLE_BIGQUERY', () => {
    expect(builder.type).toBe(DataStorageType.GOOGLE_BIGQUERY);
  });

  it('uses STRING_AGG(CAST(... AS STRING)) for STRING_AGG aggregation', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '`project`.`dataset`.`orders`',
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

    expect(sql).toContain("STRING_AGG(CAST(order_name AS STRING), ', ') AS order_names");
    expect(sql).not.toContain('LISTAGG');
    expect(sql).not.toContain('ARRAY_JOIN');
  });

  it('uses backtick quoting for identifiers', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: "Product's",
        joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
      }),
      targetTableReference: '`p`.`d`.`products`',
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

    expect(sql).toContain("`Product's_raw` AS (");
    expect(sql).toContain("`Product's` AS (");
    // Backticks, not double-quotes
    expect(sql).not.toMatch(/"Product's"/);
  });

  it('uses COUNT function correctly', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '`project`.`dataset`.`orders`',
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

  it('uses COUNT(DISTINCT field) for COUNT_DISTINCT aggregation', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '`project`.`dataset`.`orders`',
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
});
