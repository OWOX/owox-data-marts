import { HttpDataRunMetadataSchema } from './http-data-run-metadata.schema';

describe('HttpDataRunMetadataSchema', () => {
  it('preserves an executionSqlQuery string', () => {
    const parsed = HttpDataRunMetadataSchema.parse({
      format: 'ndjson',
      columns: ['date'],
      executionSqlQuery: "SELECT * FROM t WHERE date >= DATE '2026-01-01'",
    });
    expect(parsed.executionSqlQuery).toBe("SELECT * FROM t WHERE date >= DATE '2026-01-01'");
  });

  it('leaves executionSqlQuery undefined when absent', () => {
    const parsed = HttpDataRunMetadataSchema.parse({ format: 'ndjson', columns: ['date'] });
    expect(parsed.executionSqlQuery).toBeUndefined();
  });
});
