import {
  materializedViewNameFromBackingTable,
  parseScannedTablesFromPlan,
} from './redshift-explain-tables.util';

describe('parseScannedTablesFromPlan', () => {
  it('extracts local table names from XN Seq Scan nodes', () => {
    const result = parseScannedTablesFromPlan([
      'XN Merge Join DS_DIST_NONE  (cost=0.00..0.05 rows=1 width=16)',
      '  Merge Cond: ("outer".id = "inner".id)',
      '  ->  XN Seq Scan on orders  (cost=0.00..0.01 rows=1 width=8)',
      '  ->  XN Seq Scan on customers c  (cost=0.00..0.01 rows=1 width=8)',
    ]);

    expect(result.local.map(ref => ref.parts)).toEqual([['orders'], ['customers']]);
    expect(result.external).toEqual([]);
  });

  it('accepts plans without the provisioned XN prefix', () => {
    const result = parseScannedTablesFromPlan(['  ->  Seq Scan on events  (cost=0.00..0.11)']);
    expect(result.local.map(ref => ref.parts)).toEqual([['events']]);
  });

  it('deduplicates repeated scans of the same table', () => {
    const result = parseScannedTablesFromPlan([
      '->  XN Seq Scan on sales  (cost=0.00..0.01)',
      '->  XN Seq Scan on sales s2  (cost=0.00..0.01)',
    ]);
    expect(result.local.map(ref => ref.parts)).toEqual([['sales']]);
  });

  it('classifies Spectrum S3 scans as external, keeping their schema', () => {
    const result = parseScannedTablesFromPlan([
      '->  XN S3 Query Scan sales  (cost=0.00..0.02)',
      '      ->  S3 Seq Scan spectrum.sales location:"s3://bucket/sales" format:TEXT',
      '->  XN Seq Scan on local_dim  (cost=0.00..0.01)',
    ]);

    expect(result.external.map(ref => ref.parts)).toEqual([['spectrum', 'sales']]);
    expect(result.local.map(ref => ref.parts)).toEqual([['local_dim']]);
  });

  it('unquotes quoted identifiers, including embedded quotes', () => {
    const result = parseScannedTablesFromPlan([
      '->  XN Seq Scan on "Mixed Case"  (cost=0.00..0.01)',
      '->  XN Seq Scan on "with""quote"  (cost=0.00..0.01)',
    ]);
    expect(result.local.map(ref => ref.parts)).toEqual([['Mixed Case'], ['with"quote']]);
  });

  it('keeps a schema-qualified local name split into segments', () => {
    const result = parseScannedTablesFromPlan(['->  XN Seq Scan on analytics.sales  (cost=…)']);
    expect(result.local.map(ref => ref.parts)).toEqual([['analytics', 'sales']]);
  });

  it('drops planner-internal volt_ working tables', () => {
    const result = parseScannedTablesFromPlan([
      '->  XN Seq Scan on volt_tt_606590308c6a3  (cost=0.00..0.01)',
      '->  XN Seq Scan on orders  (cost=0.00..0.01)',
    ]);
    expect(result.local.map(ref => ref.parts)).toEqual([['orders']]);
  });

  it('returns nothing for a plan with no table scans', () => {
    const result = parseScannedTablesFromPlan(['XN Result  (cost=0.00..0.01 rows=1 width=0)']);
    expect(result.local).toEqual([]);
    expect(result.external).toEqual([]);
  });
});

describe('materializedViewNameFromBackingTable', () => {
  it('maps a backing table to its materialized view name', () => {
    expect(materializedViewNameFromBackingTable('mv_tbl__daily_totals__0')).toBe('daily_totals');
  });

  it('returns null for ordinary tables', () => {
    expect(materializedViewNameFromBackingTable('daily_totals')).toBeNull();
    expect(materializedViewNameFromBackingTable('mv_tbl__broken')).toBeNull();
  });
});
