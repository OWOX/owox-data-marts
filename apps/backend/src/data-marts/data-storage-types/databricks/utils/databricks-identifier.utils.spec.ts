import {
  escapeDatabricksIdentifier,
  escapeFullyQualifiedIdentifier,
} from './databricks-identifier.utils';

describe('escapeDatabricksIdentifier', () => {
  it('wraps a simple identifier in backticks', () => {
    expect(escapeDatabricksIdentifier('my_table')).toBe('`my_table`');
  });

  it('splits on dots and wraps each segment', () => {
    expect(escapeDatabricksIdentifier('catalog.schema.table')).toBe('`catalog`.`schema`.`table`');
  });

  it('doubles embedded backticks when a segment has no dots', () => {
    expect(escapeDatabricksIdentifier('my`weird`name')).toBe('`my``weird``name`');
  });

  it('returns empty string for empty input', () => {
    expect(escapeDatabricksIdentifier('')).toBe('');
  });
});

describe('escapeFullyQualifiedIdentifier', () => {
  it('quotes each part separately and joins with dots', () => {
    expect(escapeFullyQualifiedIdentifier(['catalog', 'schema', 'table'])).toBe(
      '`catalog`.`schema`.`table`'
    );
  });

  it('quotes a single-part identifier', () => {
    expect(escapeFullyQualifiedIdentifier(['table'])).toBe('`table`');
  });

  it('handles two-part identifiers', () => {
    expect(escapeFullyQualifiedIdentifier(['schema', 'table'])).toBe('`schema`.`table`');
  });
});
