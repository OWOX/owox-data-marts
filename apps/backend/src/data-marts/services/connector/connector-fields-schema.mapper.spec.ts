import { mapConnectorFieldsSchema, SourceFieldsSchema } from './connector-fields-schema.mapper';

describe('mapConnectorFieldsSchema', () => {
  const schema: SourceFieldsSchema = {
    report: { isTimeSeries: true, fields: { date: { type: 'date' } } },
    snapshot: { isTimeSeries: true, isFullRefresh: true, fields: { id: { type: 'string' } } },
    ads: { fields: { id: { type: 'string' } } },
  };
  const flags = (source?: { getDateStrategy?: (node: string) => string }) =>
    Object.fromEntries(
      mapConnectorFieldsSchema(schema, source).map(node => [node.name, node.isFetchedByDate])
    );

  it.each([
    ['day-by-day', true],
    ['range', true],
    ['none', false],
  ])(
    'reports a time-series node with the %s strategy as fetched by date: %s',
    (strategy, expected) => {
      expect(flags({ getDateStrategy: () => strategy }).report).toBe(expected);
    }
  );

  it('reports a full-refresh node as not fetched by date, whatever its strategy', () => {
    expect(flags({ getDateStrategy: () => 'day-by-day' }).snapshot).toBe(false);
  });

  it('reports a node that is not a time series as not fetched by date', () => {
    expect(flags({ getDateStrategy: () => 'day-by-day' }).ads).toBe(false);
  });

  it('treats a time-series node as fetched by date when no source or strategy is known', () => {
    expect(flags().report).toBe(true);
    expect(flags({}).report).toBe(true);
  });

  it('asks the source for the strategy of each node by name', () => {
    const getDateStrategy = jest.fn((node: string) => (node === 'report' ? 'none' : 'range'));

    expect(flags({ getDateStrategy })).toEqual({ report: false, snapshot: false, ads: false });
    expect(getDateStrategy).toHaveBeenCalledWith('report');
  });
});
