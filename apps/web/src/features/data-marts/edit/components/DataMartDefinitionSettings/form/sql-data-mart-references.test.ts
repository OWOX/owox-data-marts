import { describe, expect, it } from 'vitest';
import {
  countSqlDataMartReferences,
  sqlDataMartReference,
  sqlReferenceAtCursor,
} from './sql-data-mart-references';

describe('sqlReferenceAtCursor', () => {
  it.each([
    ['SELECT * FROM @', { query: '', start: 14 }],
    ['SELECT * FROM @ord', { query: 'ord', start: 14 }],
    ['SELECT * FROM t JOIN (@Daily co', { query: 'Daily co', start: 22 }],
    ['@', { query: '', start: 0 }],
  ])('finds the reference in %j', (prefix, expected) => {
    expect(sqlReferenceAtCursor(prefix)).toEqual(expected);
  });

  it.each([
    ["SELECT '@", 'inside a string literal'],
    ['SELECT 1 -- see @', 'inside a line comment'],
    ['SELECT 1 /* @', 'inside an open block comment'],
    ['SELECT `proj.@', 'inside a quoted identifier'],
    ['SELECT a@', 'glued to a word'],
    ['SELECT * FROM @a; DROP', 'past a statement end'],
  ])('ignores %j (%s)', prefix => {
    expect(sqlReferenceAtCursor(prefix)).toBeNull();
  });

  it('only looks at the current line', () => {
    expect(sqlReferenceAtCursor('SELECT * FROM @orders\nWHERE x = 1')).toBeNull();
  });
});

describe('sqlDataMartReference', () => {
  it('writes the id and escapes the title', () => {
    expect(
      sqlDataMartReference({
        id: '96C33880-70E3-4151-9A07-AE379C994898',
        title: 'Orders [retail] \\ EU\nnew',
      })
    ).toBe('[Orders \\[retail\\] \\\\ EU new](dm:96c33880-70e3-4151-9a07-ae379c994898)');
  });
});

describe('countSqlDataMartReferences', () => {
  it('counts references', () => {
    const id = '96c33880-70e3-4151-9a07-ae379c994898';
    expect(countSqlDataMartReferences(`FROM [A](dm:${id}) JOIN [B](dm:${id})`)).toBe(2);
    expect(countSqlDataMartReferences('SELECT 1')).toBe(0);
  });
});
