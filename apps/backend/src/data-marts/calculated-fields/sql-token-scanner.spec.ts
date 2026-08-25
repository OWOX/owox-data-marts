import { scanSql } from './sql-token-scanner';

describe('scanSql', () => {
  it('does not read a tag inside a string literal as code', () => {
    const tokens = scanSql(`CASE WHEN s = '{{ref field="x"}}' THEN 1 END`);
    expect(tokens.filter(t => t.kind === 'string').map(t => t.value)).toEqual([
      `'{{ref field="x"}}'`,
    ]);
  });

  it('skips line and block comments', () => {
    const tokens = scanSql('SUM(a) -- SUM(b)\n/* SUM(c) */ + 1');
    expect(tokens.filter(t => t.kind === 'word').map(t => t.value)).toEqual(['SUM', 'a']);
  });

  // Every warehouse ends a line comment at a lone CR — measured on all five. When the scanner
  // ended it at `\n` alone, everything after the CR stayed inside one `comment` token here while
  // the warehouse read it as code.
  it('ends a line comment at a lone carriage return', () => {
    const tokens = scanSql('SUM(a) -- SUM(b)\rSUM(c)');
    expect(tokens.filter(t => t.kind === 'word').map(t => t.value)).toEqual([
      'SUM',
      'a',
      'SUM',
      'c',
    ]);
  });

  it('ends a line comment at the CR of a CRLF pair', () => {
    const tokens = scanSql('SUM(a) -- SUM(b)\r\nSUM(c)');
    expect(tokens.filter(t => t.kind === 'comment').map(t => t.value)).toEqual(['-- SUM(b)']);
    expect(tokens.filter(t => t.kind === 'word').map(t => t.value)).toEqual([
      'SUM',
      'a',
      'SUM',
      'c',
    ]);
  });

  // The C1 shape: with the comment ending at `\n` only, this comma was swallowed and neither
  // single-expression guard could see it — both read `punct` tokens.
  it('exposes a comma hidden behind a carriage return as punctuation', () => {
    const tokens = scanSql('SUM(a) -- x\r, other_column');
    expect(tokens.filter(t => t.kind === 'punct').map(t => t.value)).toContain(',');
  });

  it('exposes a statement separator hidden behind a carriage return', () => {
    const tokens = scanSql('SUM(a) -- x\r; DROP');
    expect(tokens.filter(t => t.kind === 'punct').map(t => t.value)).toContain(';');
  });

  it('handles a doubled quote inside a string', () => {
    expect(scanSql(`'it''s'`)[0].value).toBe(`'it''s'`);
  });

  it('does not hang or throw on an unterminated string literal', () => {
    const sql = `SELECT '${'x'.repeat(10)} unterminated`;
    let tokens: ReturnType<typeof scanSql> = [];
    expect(() => {
      tokens = scanSql(sql);
    }).not.toThrow();
    const strings = tokens.filter(t => t.kind === 'string');
    expect(strings).toHaveLength(1);
    // the literal runs to the end of input rather than being dropped or split
    expect(strings[0].end).toBe(sql.length);
    expect(sql.slice(strings[0].start, strings[0].end)).toBe(strings[0].value);
  });

  it('does not hang or throw on an unterminated block comment', () => {
    const sql = '/* SUM(a) never closed';
    let tokens: ReturnType<typeof scanSql> = [];
    expect(() => {
      tokens = scanSql(sql);
    }).not.toThrow();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe('comment');
    expect(tokens[0].end).toBe(sql.length);
    expect(sql.slice(tokens[0].start, tokens[0].end)).toBe(sql);
  });

  // The token running to the end of input is the safe half; the analyzer still has to know that it
  // did, because that one token is what hides a `;`, a top-level comma or a subquery from every
  // structural guard at once.
  it('flags a run that reached the end of input without its closing mark', () => {
    expect(scanSql(`'never closed`)[0].unterminated).toBe(true);
    expect(scanSql(`"never closed`)[0].unterminated).toBe(true);
    expect(scanSql('`never closed')[0].unterminated).toBe(true);
    expect(scanSql('/* never closed')[0].unterminated).toBe(true);
  });

  it('leaves a properly closed run unflagged', () => {
    for (const sql of [`'it''s'`, `"a"`, '`a`', '/* c */', '-- c', 'SUM(a)']) {
      expect(scanSql(sql).some(t => t.unterminated)).toBe(false);
    }
  });

  // A quoting spelling this scanner does not know — Snowflake `$$…$$`, BigQuery `'''…'''` — leaves
  // an odd quote behind, and the run that opens on it never closes.
  it('flags the dialect quoting spellings that leave an odd quote behind', () => {
    expect(scanSql(`'''don't''' , other_col`).some(t => t.unterminated)).toBe(true);
    expect(scanSql(`LENGTH($$it's$$) , other_col`).some(t => t.unterminated)).toBe(true);
    // `$$abc$$` holds no quote, so nothing opens and nothing is blinded.
    expect(scanSql('CONCAT($$abc$$, x)').some(t => t.unterminated)).toBe(false);
  });

  it('reads a quoted identifier that contains a paren as a single token', () => {
    const sql = `SUM("weird(name")`;
    const tokens = scanSql(sql);
    const identifiers = tokens.filter(t => t.kind === 'quotedIdentifier');
    expect(identifiers).toHaveLength(1);
    expect(sql.slice(identifiers[0].start, identifiers[0].end)).toBe(identifiers[0].value);
    expect(identifiers[0].value).toBe(`"weird(name"`);
  });

  it('reads DISTINCT as a plain word token, not a keyword', () => {
    const tokens = scanSql('COUNT(DISTINCT x)');
    const distinct = tokens.find(t => t.value === 'DISTINCT');
    expect(distinct).toEqual(expect.objectContaining({ kind: 'word', value: 'DISTINCT' }));
  });
});

describe('scanSql — numeric literal boundaries', () => {
  // A number token must never swallow an operator: a later task compares token boundaries
  // directly against reference offsets, so a token spanning `1+2` as one value would hide the
  // `+` from every consumer, not just from arithmetic evaluation.
  it('splits an unspaced plus into number, punct, number', () => {
    const tokens = scanSql('1+2');
    expect(tokens.map(t => [t.kind, t.value])).toEqual([
      ['number', '1'],
      ['punct', '+'],
      ['number', '2'],
    ]);
  });

  it('reads a signed exponent as part of the same number token', () => {
    const tokens = scanSql('1e-3');
    expect(tokens.map(t => [t.kind, t.value])).toEqual([['number', '1e-3']]);
  });

  it('does not treat a trailing bare "e" as an exponent', () => {
    const tokens = scanSql('1e');
    expect(tokens.map(t => [t.kind, t.value])).toEqual([
      ['number', '1'],
      ['word', 'e'],
    ]);
  });

  it('pins the deliberate reading of a second dot as its own punct token', () => {
    const tokens = scanSql('1.5.2');
    expect(tokens.map(t => [t.kind, t.value])).toEqual([
      ['number', '1.5'],
      ['punct', '.'],
      ['number', '2'],
    ]);
  });
});
