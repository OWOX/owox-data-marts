import { ConnectorSourceSchema } from './connector-definition.schema';

describe('ConnectorSourceSchema version', () => {
  const base = {
    name: 'MyCustomApi',
    configuration: [{ Token: 'abc' }],
    node: 'items',
    fields: ['id'],
  };

  it('accepts a connector source without a version (backward compatible)', () => {
    expect(() => ConnectorSourceSchema.parse(base)).not.toThrow();
  });

  it('accepts an optional positive integer version', () => {
    const parsed = ConnectorSourceSchema.parse({ ...base, version: 3 });
    expect(parsed.version).toBe(3);
  });

  it('rejects a non-positive or non-integer version', () => {
    expect(() => ConnectorSourceSchema.parse({ ...base, version: 0 })).toThrow();
    expect(() => ConnectorSourceSchema.parse({ ...base, version: 1.5 })).toThrow();
  });
});
