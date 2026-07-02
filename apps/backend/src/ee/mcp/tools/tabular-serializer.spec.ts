import { serializeTsv, serializeTsvWithByteCap } from './tabular-serializer';

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

  it('always keeps at least the first row even when it alone exceeds maxBytes', () => {
    // maxBytes = 5 is far smaller than the header + first row; first row must still be included
    const { rowCount, capped } = serializeTsvWithByteCap(COLUMNS, FIVE_ROWS, 5);
    expect(rowCount).toBeGreaterThanOrEqual(1);
    expect(capped).toBe(true);
  });

  it('returns capped: false and rowCount: 0 when rows array is empty', () => {
    const { tsv, rowCount, capped } = serializeTsvWithByteCap(COLUMNS, [], 100);
    expect(capped).toBe(false);
    expect(rowCount).toBe(0);
    expect(tsv).toBe('col1\tcol2');
  });
});
