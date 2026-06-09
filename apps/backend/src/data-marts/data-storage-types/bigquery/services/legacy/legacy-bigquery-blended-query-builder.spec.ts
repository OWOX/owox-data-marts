import { DataStorageType } from '../../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { LegacyBigQueryBlendedQueryBuilder } from './legacy-bigquery-blended-query-builder';
import { BigQueryClauseRenderer } from '../bigquery-clause-renderer';

const buildContext = createBuildContext('`project`.`dataset`.`customers`');

describe('LegacyBigQueryBlendedQueryBuilder', () => {
  let builder: LegacyBigQueryBlendedQueryBuilder;

  beforeEach(() => {
    builder = new LegacyBigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());
  });

  it('should have type LEGACY_GOOGLE_BIGQUERY', () => {
    expect(builder.type).toBe(DataStorageType.LEGACY_GOOGLE_BIGQUERY);
  });

  it('uses STRING_AGG(CAST(... AS STRING)) and backtick quoting (BigQuery dialect)', () => {
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

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['order_names']));

    expect(sql).toContain("STRING_AGG(CAST(order_name AS STRING), ', ') AS order_names");
    expect(sql).not.toContain('LISTAGG');
  });
});
