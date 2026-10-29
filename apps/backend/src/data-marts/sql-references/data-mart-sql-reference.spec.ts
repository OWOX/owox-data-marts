import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  assertNoDataMartReferences,
  hasDataMartReferences,
  maskDataMartReferences,
  parseDataMartReferences,
  replaceDataMartReferences,
  resolvedSqlQueryOf,
  serializeDataMartReference,
  sqlLexingOptionsFor,
} from './data-mart-sql-reference';

const ORDERS = '96c33880-70e3-4151-9a07-ae379c994898';
const COSTS = '0b5d4c3a-9e1f-4a6b-8c9d-0e1f2a3b4c5d';

describe('parseDataMartReferences', () => {
  it('finds a reference with its id, title and offsets', () => {
    const sql = `SELECT * FROM [Orders](dm:${ORDERS}) WHERE x = 1`;

    const [reference] = parseDataMartReferences(sql);

    expect(reference).toEqual({
      id: ORDERS,
      title: 'Orders',
      start: sql.indexOf('['),
      end: sql.indexOf(')') + 1,
    });
  });

  it('finds every reference, in order, and lower-cases ids', () => {
    const sql =
      `SELECT * FROM [Orders](dm:${ORDERS.toUpperCase()}) o ` +
      `JOIN [Daily costs](dm:${COSTS}) c ON o.d = c.d`;

    expect(parseDataMartReferences(sql).map(r => [r.id, r.title])).toEqual([
      [ORDERS, 'Orders'],
      [COSTS, 'Daily costs'],
    ]);
  });

  it('reads escaped brackets and backslashes in the title', () => {
    const sql = String.raw`FROM [Orders \[retail\] \\ EU](dm:${ORDERS})`;

    expect(parseDataMartReferences(sql)[0].title).toBe(String.raw`Orders [retail] \ EU`);
  });

  it('skips references inside string literals, comments and quoted identifiers', () => {
    const sql = [
      `SELECT '[A](dm:${ORDERS})' AS s, "[B](dm:${ORDERS})" AS q`,
      `-- FROM [C](dm:${ORDERS})`,
      `/* FROM [D](dm:${ORDERS}) */`,
      `FROM [Real](dm:${COSTS})`,
    ].join('\n');

    expect(parseDataMartReferences(sql).map(r => r.title)).toEqual(['Real']);
  });

  it('does not let an apostrophe in a title open a string literal', () => {
    const sql = `FROM [O'Brien orders](dm:${ORDERS}) JOIN [Costs](dm:${COSTS})`;

    expect(parseDataMartReferences(sql).map(r => r.title)).toEqual(["O'Brien orders", 'Costs']);
  });

  it('skips # comments only when the storage has them', () => {
    const sql = `SELECT 1 # it's [Old](dm:${ORDERS})\nFROM [New](dm:${COSTS})`;

    expect(
      parseDataMartReferences(sql, sqlLexingOptionsFor(DataStorageType.GOOGLE_BIGQUERY)).map(
        r => r.title
      )
    ).toEqual(['New']);
    expect(sqlLexingOptionsFor(DataStorageType.SNOWFLAKE).hashLineComments).toBe(false);
  });

  it('skips // comments on Snowflake, where an apostrophe in one would hide what follows', () => {
    const sql = `// don't count drafts [Old](dm:${ORDERS})\nSELECT * FROM [New](dm:${COSTS}) n WHERE n.x = 'y'`;

    expect(
      parseDataMartReferences(sql, sqlLexingOptionsFor(DataStorageType.SNOWFLAKE)).map(r => r.title)
    ).toEqual(['New']);
    expect(sqlLexingOptionsFor(DataStorageType.GOOGLE_BIGQUERY).slashLineComments).toBe(false);
  });

  it.each([
    [
      'a backslash on AWS Athena, where it ends no literal',
      DataStorageType.AWS_ATHENA,
      String.raw`SELECT 'C:\' AS path, '[Old](dm:${ORDERS})' AS s FROM [New](dm:${COSTS}) n`,
    ],
    [
      'a triple-quoted string on Google BigQuery',
      DataStorageType.GOOGLE_BIGQUERY,
      `SELECT '''don't [Old](dm:${ORDERS})''' AS s FROM [New](dm:${COSTS}) n WHERE n.x = 'y'`,
    ],
    [
      'a dollar-quoted string on Snowflake',
      DataStorageType.SNOWFLAKE,
      `SELECT $$it's [Old](dm:${ORDERS})$$ AS s FROM [New](dm:${COSTS}) n WHERE n.x = 'y'`,
    ],
  ])('reads %s as one literal', (_case, storageType, sql) => {
    expect(
      parseDataMartReferences(sql, sqlLexingOptionsFor(storageType)).map(r => r.title)
    ).toEqual(['New']);
  });

  it('ignores look-alikes that are not references', () => {
    expect(parseDataMartReferences('SELECT arr[1](dm:not-an-id) FROM t')).toEqual([]);
    expect(parseDataMartReferences(`SELECT [Orders](${ORDERS}) FROM t`)).toEqual([]);
    expect(parseDataMartReferences(`FROM [Multi\nline](dm:${ORDERS})`)).toEqual([]);
  });
});

describe('serializeDataMartReference', () => {
  it('round-trips through the parser', () => {
    const title = String.raw`Orders [retail] \ EU`;
    const sql = `FROM ${serializeDataMartReference({ id: ORDERS.toUpperCase(), title })}`;

    expect(parseDataMartReferences(sql)).toEqual([expect.objectContaining({ id: ORDERS, title })]);
  });

  it('flattens line breaks in the title', () => {
    expect(serializeDataMartReference({ id: ORDERS, title: 'Two\nlines' })).toBe(
      `[Two lines](dm:${ORDERS})`
    );
  });
});

describe('replaceDataMartReferences', () => {
  it('replaces each reference with what the renderer returns', async () => {
    const sql = `FROM [A](dm:${ORDERS}) JOIN [B](dm:${COSTS}) USING (d)`;
    const references = parseDataMartReferences(sql);

    const result = await replaceDataMartReferences(sql, references, async ref => `<${ref.title}>`);

    expect(result).toBe('FROM <A> JOIN <B> USING (d)');
  });
});

describe('maskDataMartReferences', () => {
  it('blanks references without moving other text', () => {
    const sql = `FROM [A](dm:${ORDERS}) x`;
    const [reference] = parseDataMartReferences(sql);

    expect(maskDataMartReferences(sql, [reference])).toBe(
      `FROM ${' '.repeat(reference.end - reference.start)} x`
    );
  });
});

describe('guards', () => {
  it('hasDataMartReferences is false for SQL without the marker', () => {
    expect(hasDataMartReferences('SELECT * FROM t')).toBe(false);
  });

  it('assertNoDataMartReferences names the caller', () => {
    expect(() =>
      assertNoDataMartReferences(`FROM [A](dm:${ORDERS})`, 'Snowflake query builder')
    ).toThrow(/Snowflake query builder: the SQL still contains a Data Mart reference/);
    expect(() => assertNoDataMartReferences(`SELECT '[A](dm:${ORDERS})'`, 'x')).not.toThrow();
  });

  it('resolvedSqlQueryOf passes resolved SQL through and refuses unresolved', () => {
    expect(resolvedSqlQueryOf({ sqlQuery: 'SELECT 1' }, DataStorageType.AWS_ATHENA)).toBe(
      'SELECT 1'
    );
    expect(() =>
      resolvedSqlQueryOf({ sqlQuery: `FROM [A](dm:${ORDERS})` }, DataStorageType.AWS_ATHENA)
    ).toThrow(/AWS_ATHENA query builder/);
  });
});
