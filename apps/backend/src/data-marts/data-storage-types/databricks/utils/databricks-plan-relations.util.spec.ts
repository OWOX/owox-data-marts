import { parseRelationsFromSparkPlan } from './databricks-plan-relations.util';

describe('parseRelationsFromSparkPlan', () => {
  it('extracts tables from analyzed-plan Relation nodes', () => {
    const plan = [
      '== Analyzed Logical Plan ==',
      'id: int, revenue: int',
      'Project [id#1, revenue#2]',
      '+- Relation main.dlu.orders[id#1,revenue#2] parquet',
    ].join('\n');

    expect(parseRelationsFromSparkPlan(plan)).toEqual([
      { name: 'main.dlu.orders', segments: ['main', 'dlu', 'orders'] },
    ]);
  });

  it('extracts tables from physical-plan scans, Photon included', () => {
    const plan = [
      '== Physical Plan ==',
      '*(1) ColumnarToRow',
      '+- FileScan parquet main.dlu.orders[id#1] Batched: true',
      '+- PhotonScan parquet main.dlu.customers[id#5] DataFilters: []',
    ].join('\n');

    expect(
      parseRelationsFromSparkPlan(plan)
        .map(ref => ref.name)
        .sort()
    ).toEqual(['main.dlu.customers', 'main.dlu.orders']);
  });

  it('deduplicates a table appearing in several plan sections', () => {
    const plan = [
      '+- Relation main.dlu.orders[id#1] parquet',
      '+- FileScan parquet main.dlu.orders[id#1]',
    ].join('\n');

    expect(parseRelationsFromSparkPlan(plan).map(ref => ref.name)).toEqual(['main.dlu.orders']);
  });

  it('strips backticks and the legacy spark_catalog prefix', () => {
    const plan = [
      '+- Relation spark_catalog.default.orders[id#1] parquet',
      '+- Relation `main`.`weird schema`.`orders`[id#2] parquet',
    ].join('\n');

    expect(
      parseRelationsFromSparkPlan(plan)
        .map(ref => ref.name)
        .sort()
    ).toEqual(['default.orders', 'main.weird schema.orders']);
  });

  it('preserves dots inside a backticked segment in the segments array', () => {
    const plan = '+- Relation `main`.`weird.schema`.`orders`[id#1] parquet';

    expect(parseRelationsFromSparkPlan(plan)).toEqual([
      { name: 'main.weird.schema.orders', segments: ['main', 'weird.schema', 'orders'] },
    ]);
  });

  it('ignores single-segment names and unrelated plan text', () => {
    const plan = [
      '== Optimized Logical Plan ==',
      'Project [id#1]',
      '+- Filter (isnotnull(id#1) AND (id#1 > 5))',
      '+- LocalRelation [id#1]',
    ].join('\n');

    expect(parseRelationsFromSparkPlan(plan)).toEqual([]);
  });

  it('returns [] for empty or unrecognisable output', () => {
    expect(parseRelationsFromSparkPlan('')).toEqual([]);
    expect(parseRelationsFromSparkPlan('no plan here')).toEqual([]);
  });
});
