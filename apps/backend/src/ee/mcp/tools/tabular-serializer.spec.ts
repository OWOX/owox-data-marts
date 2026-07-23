import { formatTsvColumnLabels, serializeTsv, serializeTsvWithByteCap } from './tabular-serializer';

describe('formatTsvColumnLabels', () => {
  it('falls back for blank aliases and disambiguates duplicate business labels', () => {
    expect(
      formatTsvColumnLabels([
        { name: 'created_at', displayName: '  ' },
        { name: 'updated_at', displayName: 'Date' },
        { name: 'event_date', displayName: 'Date' },
      ])
    ).toEqual(['created_at', 'Date (updated_at)', 'Date (event_date)']);
  });
});

describe('serializeTsv', () => {
  it('serializes header-once TSV', () => {
    expect(
      serializeTsv(
        ['a', 'b'],
        [
          [1, 'x'],
          [2, null],
        ]
      )
    ).toBe('a\tb\n1\tx\n2\t');
  });

  it('handles empty rows', () => {
    expect(serializeTsv(['col'], [])).toBe('col');
  });

  it('converts undefined to empty string', () => {
    expect(serializeTsv(['a', 'b'], [[1, undefined]])).toBe('a\tb\n1\t');
  });

  it('converts values to strings', () => {
    expect(serializeTsv(['a', 'b', 'c'], [[123, true, false]])).toBe('a\tb\tc\n123\ttrue\tfalse');
  });

  it('handles multiple rows', () => {
    expect(
      serializeTsv(
        ['x', 'y'],
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ]
      )
    ).toBe('x\ty\n1\t2\n3\t4\n5\t6');
  });

  it('escapes embedded tab and newline so they cannot create phantom columns or rows', () => {
    expect(serializeTsv(['a', 'b'], [['hello\tworld', 'line1\nline2']])).toBe(
      'a\tb\nhello\\tworld\tline1\\nline2'
    );
  });

  it('escapes control characters in header labels as well as cells', () => {
    const { tsv, headerColumns } = serializeTsvWithByteCap(
      ['A\tB', 'C\nD'],
      [['1', '2']],
      Infinity
    );

    expect(headerColumns).toEqual(['A\\tB', 'C\\nD']);
    expect(tsv).toBe('A\\tB\tC\\nD\n1\t2');
  });

  it('escapes backslash before other control chars', () => {
    expect(serializeTsv(['c'], [['path\\to\\file']])).toBe('c\npath\\\\to\\\\file');
  });

  it('escapes carriage return', () => {
    expect(serializeTsv(['c'], [['a\rb']])).toBe('c\na\\rb');
  });

  it('JSON-encodes RECORD/STRUCT and ARRAY cells instead of emitting [object Object]', () => {
    expect(serializeTsv(['obj', 'arr'], [[{ a: 1, b: 'x' }, [1, 2, 3]]])).toBe(
      'obj\tarr\n{"a":1,"b":"x"}\t[1,2,3]'
    );
  });

  it('serializes a nested BigInt inside a STRUCT/ARRAY cell instead of throwing', () => {
    // A BigQuery INT64 nested in a RECORD arrives as a BigInt; plain JSON.stringify would throw
    // AFTER the query ran and was billed. It must serialize to its decimal string instead.
    expect(serializeTsv(['rec'], [[{ id: 9007199254740993n }]])).toBe(
      'rec\n{"id":"9007199254740993"}'
    );
    expect(serializeTsv(['arr'], [[[1n, 2n]]])).toBe('arr\n["1","2"]');
  });
});

describe('serializeTsvWithByteCap', () => {
  // columns: 'col1\tcol2' = 9 bytes
  // each row line (with leading \n): '\naa\tbb' = 7 bytes
  const COLUMNS = ['col1', 'col2'];
  const FIVE_ROWS: unknown[][] = [
    ['aa', 'bb'],
    ['cc', 'dd'],
    ['ee', 'ff'],
    ['gg', 'hh'],
    ['ii', 'jj'],
  ];

  it('caps at maxBytes, drops tail rows, sets capped: true', () => {
    // header=9, row1=7 → total 16, row2=7 → total 23, row3 would be 30 > 25 → break
    const maxBytes = 25;
    const { tsv, rowCount, capped } = serializeTsvWithByteCap(COLUMNS, FIVE_ROWS, maxBytes);
    expect(capped).toBe(true);
    expect(rowCount).toBe(2);
    expect(Buffer.byteLength(tsv, 'utf8')).toBeLessThanOrEqual(maxBytes);
  });

  it('with maxBytes = Infinity all rows are included and capped is false', () => {
    const { tsv, rowCount, capped } = serializeTsvWithByteCap(COLUMNS, FIVE_ROWS, Infinity);
    expect(capped).toBe(false);
    expect(rowCount).toBe(5);
    // output must equal what serializeTsv produces
    expect(tsv).toBe(serializeTsv(COLUMNS, FIVE_ROWS));
  });

  it('serializeTsv delegates to serializeTsvWithByteCap (same output)', () => {
    const direct = serializeTsv(COLUMNS, FIVE_ROWS);
    const { tsv } = serializeTsvWithByteCap(COLUMNS, FIVE_ROWS, Number.POSITIVE_INFINITY);
    expect(direct).toBe(tsv);
  });

  it('enforces the ceiling even on the first row — an oversized first row is dropped, not emitted', () => {
    // maxBytes = 5 is far smaller than the header + first row; the ceiling is hard, so no row fits.
    const { tsv, rowCount, capped } = serializeTsvWithByteCap(COLUMNS, FIVE_ROWS, 5);
    expect(rowCount).toBe(0);
    expect(capped).toBe(true);
    expect(tsv).toBe('col1\tcol2'); // header only
  });

  it('drops a single pathologically wide first row so the payload stays under the cap', () => {
    const wide = 'x'.repeat(500);
    const { rowCount, capped } = serializeTsvWithByteCap(['a'], [[wide], ['ok']], 100);
    expect(rowCount).toBe(0);
    expect(capped).toBe(true);
  });

  it('returns capped: false and rowCount: 0 when rows array is empty', () => {
    const { tsv, rowCount, capped } = serializeTsvWithByteCap(COLUMNS, [], 100);
    expect(capped).toBe(false);
    expect(rowCount).toBe(0);
    expect(tsv).toBe('col1\tcol2');
  });
});
