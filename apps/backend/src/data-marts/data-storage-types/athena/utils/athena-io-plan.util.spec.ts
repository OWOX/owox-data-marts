import { parseInputTablesFromIoPlan } from './athena-io-plan.util';

describe('parseInputTablesFromIoPlan', () => {
  it('extracts input tables from the documented IO plan shape', () => {
    const plan = JSON.stringify({
      inputTableColumnInfos: [
        {
          table: {
            catalog: 'awsdatacatalog',
            schemaTable: { schema: 'sampledb', table: 'elb_logs' },
          },
          columnConstraints: [],
        },
        {
          table: {
            catalog: 'awsdatacatalog',
            schemaTable: { schema: 'dlu_test', table: 'orders' },
          },
        },
      ],
    });

    expect(parseInputTablesFromIoPlan(plan)).toEqual([
      { catalog: 'awsdatacatalog', schema: 'sampledb', table: 'elb_logs' },
      { catalog: 'awsdatacatalog', schema: 'dlu_test', table: 'orders' },
    ]);
  });

  it('deduplicates a table referenced twice', () => {
    const entry = {
      table: { catalog: 'awsdatacatalog', schemaTable: { schema: 'db', table: 't' } },
    };
    const plan = JSON.stringify({ inputTableColumnInfos: [entry, entry] });

    expect(parseInputTablesFromIoPlan(plan)).toHaveLength(1);
  });

  it('survives leading non-JSON noise, such as a header line', () => {
    const plan =
      'Query Plan\n' +
      JSON.stringify({
        inputTableColumnInfos: [
          { table: { catalog: 'awsdatacatalog', schemaTable: { schema: 'db', table: 't' } } },
        ],
      });

    expect(parseInputTablesFromIoPlan(plan)).toEqual([
      { catalog: 'awsdatacatalog', schema: 'db', table: 't' },
    ]);
  });

  it('finds tables in unfamiliar nesting as long as {schema, table} pairs exist', () => {
    const plan = JSON.stringify({
      somethingNew: [{ deep: { catalog: 'other_catalog', inner: { schema: 's', table: 't' } } }],
    });

    expect(parseInputTablesFromIoPlan(plan)).toEqual([
      { catalog: 'other_catalog', schema: 's', table: 't' },
    ]);
  });

  it('returns [] for a constant query plan without input tables', () => {
    expect(parseInputTablesFromIoPlan(JSON.stringify({ inputTableColumnInfos: [] }))).toEqual([]);
  });

  it('returns [] for unparseable output', () => {
    expect(parseInputTablesFromIoPlan('')).toEqual([]);
    expect(parseInputTablesFromIoPlan('not json at all')).toEqual([]);
    expect(parseInputTablesFromIoPlan('{ broken json')).toEqual([]);
  });
});
