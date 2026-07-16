import { HTTP_DATA_MAX_ENCODED_PARAM_LENGTH, HttpDataQuerySchema } from './http-data-query.schema';

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function parse(rawQuery: Record<string, unknown>) {
  const result = HttpDataQuerySchema.safeParse(rawQuery);
  return result;
}

describe('HttpDataQuerySchema — aggregation', () => {
  it('decodes a base64url-encoded aggregation config into the query', () => {
    const aggregation = [
      { column: 'revenue', function: 'SUM' },
      { column: 'orders', function: 'COUNT_DISTINCT' },
    ];
    const result = parse({ column: 'revenue', aggregation: b64(aggregation) });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aggregation).toEqual(aggregation);
    }
  });

  it('leaves aggregation undefined when the parameter is absent', () => {
    const result = parse({ column: 'date' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aggregation).toBeUndefined();
    }
  });

  it('rejects an aggregation parameter that is not valid base64url JSON', () => {
    const result = parse({ column: 'revenue', aggregation: 'not-base64url-json' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/^Invalid aggregation:/);
    }
  });

  it('rejects an aggregation with an unknown function', () => {
    const result = parse({
      column: 'revenue',
      aggregation: b64([{ column: 'revenue', function: 'NONSENSE' }]),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/^Invalid aggregation:/);
    }
  });
});

describe('HttpDataQuerySchema — dateTrunc', () => {
  it('decodes a base64url-encoded date-trunc config into the query', () => {
    const dateTrunc = [
      { column: 'date', unit: 'MONTH' },
      { column: 'created_at', unit: 'DAY', timeZone: 'America/New_York' },
    ];
    const result = parse({ column: 'date', dateTrunc: b64(dateTrunc) });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateTrunc).toEqual(dateTrunc);
    }
  });

  it('leaves dateTrunc undefined when the parameter is absent', () => {
    const result = parse({ column: 'date' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateTrunc).toBeUndefined();
    }
  });

  it('rejects a date-trunc parameter that is not valid base64url JSON', () => {
    const result = parse({ column: 'date', dateTrunc: 'not-base64url-json' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/^Invalid dateTrunc:/);
    }
  });

  it('rejects a date-trunc rule with an unknown unit', () => {
    const result = parse({
      column: 'date',
      dateTrunc: b64([{ column: 'date', unit: 'FORTNIGHT' }]),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/^Invalid dateTrunc:/);
    }
  });

  it('rejects a date-trunc rule with a malformed IANA time zone', () => {
    const result = parse({
      column: 'date',
      dateTrunc: b64([{ column: 'date', unit: 'DAY', timeZone: "utc'; DROP TABLE" }]),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/^Invalid dateTrunc:/);
    }
  });
});

describe('HttpDataQuerySchema — encoded parameter length cap', () => {
  it('rejects an aggregation parameter longer than the max encoded length', () => {
    const tooLong = 'A'.repeat(HTTP_DATA_MAX_ENCODED_PARAM_LENGTH + 1);
    const result = parse({ column: 'revenue', aggregation: tooLong });
    expect(result.success).toBe(false);
  });

  it('rejects a dateTrunc parameter longer than the max encoded length', () => {
    const tooLong = 'A'.repeat(HTTP_DATA_MAX_ENCODED_PARAM_LENGTH + 1);
    const result = parse({ column: 'date', dateTrunc: tooLong });
    expect(result.success).toBe(false);
  });

  it('accepts a parameter exactly at the max encoded length (rejected only for content, not size)', () => {
    // A cap-length string is NOT rejected by the size guard; it fails later only because it is not
    // valid encoded JSON — proving the boundary is inclusive.
    const atCap = 'A'.repeat(HTTP_DATA_MAX_ENCODED_PARAM_LENGTH);
    const result = parse({ column: 'revenue', aggregation: atCap });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/^Invalid aggregation:/);
    }
  });
});

describe('HttpDataQuerySchema — aggregation/dateTrunc require an explicit projection', () => {
  it('rejects an aggregation with no column selection (would group by every column)', () => {
    const result = parse({ aggregation: b64([{ column: 'revenue', function: 'SUM' }]) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const guard = result.error.issues.find(i => /explicit "column"/.test(i.message));
      expect(guard?.path).toEqual(['aggregation']);
    }
  });

  it('rejects an aggregation combined with the columns=* wildcard', () => {
    const result = parse({
      columns: '*',
      column: 'revenue',
      aggregation: b64([{ column: 'revenue', function: 'SUM' }]),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a date-trunc combined with columns=** and points the issue at dateTrunc', () => {
    const result = parse({ columns: '**', dateTrunc: b64([{ column: 'date', unit: 'MONTH' }]) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const guard = result.error.issues.find(i => /explicit "column"/.test(i.message));
      expect(guard?.path).toEqual(['dateTrunc']);
    }
  });

  it('accepts an aggregation with explicit column values', () => {
    const result = parse({
      column: ['date', 'revenue'],
      aggregation: b64([{ column: 'revenue', function: 'SUM' }]),
    });
    expect(result.success).toBe(true);
  });

  it('accepts a plain (unaggregated) request with the columns=* wildcard', () => {
    const result = parse({ columns: '*' });
    expect(result.success).toBe(true);
  });
});
