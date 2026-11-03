import {
  containsWithKeyword,
  hasAliasAt,
  isRecursiveQuery,
  renderDerivedTable,
  toSingleStatement,
  topLevelCteBodies,
} from './sql-reference-inlining';

describe('toSingleStatement', () => {
  it('drops trailing semicolons and whatever follows them', () => {
    expect(toSingleStatement('SELECT 1;  ;\n-- done')).toBe('SELECT 1');
  });

  it('keeps a statement without semicolons as is, comments included', () => {
    expect(toSingleStatement('  SELECT 1 -- note\n')).toBe('SELECT 1 -- note');
  });

  it('ignores semicolons inside literals and comments', () => {
    expect(toSingleStatement("SELECT ';' AS s /* ; */ FROM t")).toBe(
      "SELECT ';' AS s /* ; */ FROM t"
    );
  });

  it('returns null for several statements', () => {
    expect(toSingleStatement('DECLARE x INT64; SELECT x')).toBeNull();
  });

  it('honours # comments when asked', () => {
    expect(toSingleStatement('SELECT 1 # a; b', { hashLineComments: true })).toBe(
      'SELECT 1 # a; b'
    );
  });
});

describe('isRecursiveQuery / containsWithKeyword', () => {
  it('recognises WITH RECURSIVE at the start, after comments', () => {
    expect(isRecursiveQuery('-- tree\nwith recursive t AS (SELECT 1) SELECT * FROM t')).toBe(true);
    expect(isRecursiveQuery('WITH t AS (SELECT 1) SELECT * FROM t')).toBe(false);
  });

  it('finds WITH anywhere outside literals', () => {
    expect(containsWithKeyword('SELECT * FROM (WITH a AS (SELECT 1) SELECT * FROM a) t')).toBe(
      true
    );
    expect(containsWithKeyword("SELECT 'with' AS w FROM t")).toBe(false);
  });
});

describe('topLevelCteBodies', () => {
  it('returns the body of each top-level CTE', () => {
    const sql =
      'WITH a AS (SELECT 1 AS x), "b c" (y) AS MATERIALIZED (SELECT (2) AS y) SELECT * FROM a, b';
    const bodies = topLevelCteBodies(sql).map(([from, to]) => sql.slice(from, to));

    expect(bodies).toEqual(['SELECT 1 AS x', 'SELECT (2) AS y']);
  });

  it('is empty for a query without a WITH clause', () => {
    expect(topLevelCteBodies('SELECT * FROM (WITH a AS (SELECT 1) SELECT * FROM a) t')).toEqual([]);
  });

  it('stops at an unbalanced body instead of throwing', () => {
    expect(topLevelCteBodies('WITH a AS (SELECT 1')).toEqual([]);
  });
});

describe('hasAliasAt', () => {
  const at = (sql: string) => hasAliasAt(sql, sql.indexOf('|') + 1);

  it.each([
    ['FROM t| AS o WHERE', true],
    ['FROM t| o WHERE', true],
    ['FROM t| `o` WHERE', true],
    ['FROM t| WHERE x', false],
    ['FROM t| JOIN u ON', false],
    ['FROM t|, u', false],
    ['(SELECT * FROM t|)', false],
    ['FROM t|', false],
    ['FROM t| -- note\n  GROUP BY 1', false],
  ])('%s → %s', (sql, expected) => {
    expect(at(sql)).toBe(expected);
  });
});

describe('renderDerivedTable', () => {
  it('labels the block and keeps the closing parenthesis off a trailing comment', () => {
    expect(renderDerivedTable('SELECT 1 -- tail', 'Orders -- EU (id)')).toBe(
      '(\n-- Data Mart: Orders — EU (id)\nSELECT 1 -- tail\n)'
    );
  });
});
