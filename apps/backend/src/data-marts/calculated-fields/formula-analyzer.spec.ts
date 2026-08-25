import { analyzeFormula, AnalyzeFormulaInput } from './formula-analyzer';
import { FormulaFunctionDialect } from './formula-function-dialect';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

class BaseTestDialect implements FormulaFunctionDialect {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  private readonly names = new Set(['SUM', 'COUNT', 'AVG']);

  isAggregateFunction(name: string): boolean {
    return this.names.has(name.trim().toUpperCase());
  }
}

const dialect = new BaseTestDialect(); // isAggregateFunction: SUM/COUNT/AVG only
// Typed as the real callback, not inferred from the default: inference narrowed the parameter to
// `() => 'ok'`, so every call site passing a callback that can answer 'missing' / 'calculated-*' /
// 'aggregate' — i.e. every interesting one — was a type error invisible to CI (the build tsconfig
// excludes specs and Jest runs with diagnostics off).
const analyze = (
  formula: string,
  known: AnalyzeFormulaInput['knownField'] = () => 'ok'
): ReturnType<typeof analyzeFormula> =>
  analyzeFormula({ fieldName: 'ctr', formula, dialect, knownField: known });

describe('analyzeFormula', () => {
  it('resolves the owner of each aggregate call', () => {
    const a = analyze('SUM({{ref field="clicks"}}) / SUM({{ref path="costs" field="spend"}})');
    expect(a.errors).toEqual([]);
    expect(a.aggregateCalls.map(c => [c.name, c.owner])).toEqual([
      ['SUM', ''],
      ['SUM', 'costs'],
    ]);
  });

  it('rejects a bare row-level column outside any aggregate', () => {
    const a = analyze('SUM({{ref field="clicks"}}) / {{ref field="cost"}}');
    expect(a.errors[0]).toEqual(expect.objectContaining({ code: 'FORMULA_LEVEL_MIXING' }));
    expect(a.errors[0].message).toContain('`cost` is a row-level column');
  });

  it('rejects one aggregate mixing owners', () => {
    const a = analyze('SUM({{ref field="clicks"}} * {{ref path="costs" field="spend"}})');
    expect(a.errors[0].code).toBe('FORMULA_AGGREGATE_MIXES_OWNERS');
    expect(a.errors[0].message).toContain('clicks');
    expect(a.errors[0].message).toContain('costs.spend');
  });

  it('rejects an aggregate nested in an aggregate, naming the outer function', () => {
    const a = analyze('SUM(AVG({{ref field="x"}}))');
    expect(a.errors[0].code).toBe('FORMULA_NESTED_AGGREGATE');
    // Not "AVG" (the inner call the error is about) — the outer one that must be split apart.
    expect(a.errors[0].message).toContain('`SUM`');
  });

  // aggregateCalls is only meaningful when errors is empty. The OUTER call of a nested pair is not
  // itself "contained by" another aggregate, so it still resolves and is pushed to aggregateCalls —
  // the inner one alone is dropped (continue, after the error). A caller that reads aggregateCalls
  // without checking errors.length === 0 first would render the outer call as if the formula were
  // clean, producing a plausible, wrong query. Every consumer of this shape MUST gate on errors.
  it('aggregateCalls stays populated for the outer call even though errors is non-empty (SUM(SUM(x)))', () => {
    const a = analyze('SUM(SUM({{ref field="x"}}))');
    expect(a.errors).toHaveLength(1);
    expect(a.errors[0].code).toBe('FORMULA_NESTED_AGGREGATE');
    expect(a.aggregateCalls).toHaveLength(1);
    expect(a.aggregateCalls[0]).toEqual(expect.objectContaining({ name: 'SUM', owner: '' }));
  });

  it('rejects an aggregate with no field reference', () => {
    const a = analyze('COUNT(*) / SUM({{ref field="x"}})');
    expect(a.errors[0].code).toBe('FORMULA_AGGREGATE_WITHOUT_FIELD');
    expect(a.errors[0].message).toContain('COUNT(field)');
  });

  it('rejects a subquery and a window function', () => {
    expect(analyze('SUM({{ref field="x"}}) + (SELECT 1)').errors[0].code).toBe(
      'FORMULA_SUBQUERY_NOT_ALLOWED'
    );
    expect(analyze('SUM({{ref field="x"}}) OVER ()').errors[0].code).toBe(
      'FORMULA_WINDOW_NOT_ALLOWED'
    );
  });

  // The stored formula is spliced verbatim into the SELECT list, so `;` — the one character that
  // ends a statement and starts another — is refused outright rather than left to the dry run.
  it('rejects a statement separator anywhere in the formula', () => {
    expect(analyze('SUM({{ref field="x"}});').errors[0].code).toBe(
      'FORMULA_STATEMENT_SEPARATOR_NOT_ALLOWED'
    );
    expect(analyze('SUM({{ref field="x"}}); DROP TABLE t').errors.map(e => e.code)).toContain(
      'FORMULA_STATEMENT_SEPARATOR_NOT_ALLOWED'
    );
  });

  // A `;` that is TEXT to the warehouse is not a statement separator: the scanner gives it a
  // `string`/`comment` token kind, and only a bare `punct` one is refused.
  it('accepts a semicolon inside a string literal or a comment', () => {
    expect(analyze(`SUM({{ref field="x"}}) + LENGTH(';')`).errors).toEqual([]);
    expect(analyze('SUM({{ref field="x"}}) -- ; not a statement\n').errors).toEqual([]);
  });

  // Same class as `;`, one nesting level down: a comma at depth 0 ends the EXPRESSION and starts
  // another one inside the same SELECT list, dragging an extra column into the projection and
  // hanging the output alias on the wrong expression — and on the grouping path it changes the
  // report's granularity. The dry run passes it, because it is valid SQL.
  it('rejects a top-level comma, which would project a second expression', () => {
    expect(analyze('{{ref field="clicks"}}, {{ref field="other"}}').errors[0].code).toBe(
      'FORMULA_EXPRESSION_SEPARATOR_NOT_ALLOWED'
    );
    expect(
      analyze('SUM({{ref field="x"}}), COUNT({{ref field="y"}})').errors.map(e => e.code)
    ).toContain('FORMULA_EXPRESSION_SEPARATOR_NOT_ALLOWED');
  });

  // Only DEPTH 0 counts. A comma between a call's arguments is ordinary SQL, as is one that is
  // text to the warehouse — so the check reads paren depth over the token stream rather than
  // looking for a `,` anywhere in the formula.
  it('accepts a comma inside a function call, a string literal or a comment', () => {
    expect(analyze('CONCAT({{ref field="a"}}, {{ref field="b"}})').errors).toEqual([]);
    expect(analyze('SUM(ROUND({{ref field="x"}}, 2))').errors).toEqual([]);
    expect(analyze(`SUM({{ref field="x"}}) + LENGTH(',')`).errors).toEqual([]);
    expect(analyze('SUM({{ref field="x"}}) -- , not a second column\n').errors).toEqual([]);
  });

  // A `--` comment ends at a lone CR on every target warehouse (measured on all five), so anything
  // after one is CODE there. While the scanner ended the comment at `\n` alone, both guards below
  // read the whole tail as one `comment` token and passed it: the warehouse then projected two
  // select items and hung the field's output alias on the smuggled one, and the dry run — which
  // only asks whether the SQL is valid — had no objection.
  it('rejects a comma smuggled past the comment guard by a carriage return', () => {
    expect(
      analyze('SUM({{ref field="x"}}) -- c\r, other_column').errors.map(e => e.code)
    ).toContain('FORMULA_EXPRESSION_SEPARATOR_NOT_ALLOWED');
  });

  it('rejects a statement separator smuggled past the comment guard by a carriage return', () => {
    expect(
      analyze('SUM({{ref field="x"}}) -- c\r; DROP TABLE t').errors.map(e => e.code)
    ).toContain('FORMULA_STATEMENT_SEPARATOR_NOT_ALLOWED');
  });

  // `#` and `//` are the two markers the warehouses CONTRADICT each other about, so no single
  // lexical model can be right everywhere. Measured: `SELECT 5 # 3` is 5 on BigQuery (a comment)
  // and 6 on Redshift (bitwise XOR); `SELECT 1 + 2 # + 100` is 3 and 103. `//` opens a comment on
  // Snowflake and is a syntax error on the other four. Read as CODE — which is what one lexical
  // model must do — the analyzer validates a tail the warehouse drops, and the dry run sees valid
  // SQL, so the report is quietly missing part of its own formula.
  it.each([
    ['a hash comment marker', 'SUM({{ref field="x"}}) # + SUM({{ref field="y"}})', '#'],
    ['a double-slash comment marker', 'SUM({{ref field="x"}}) // note', '//'],
  ])('rejects %s, which the warehouses disagree about', (_case, formula, marker) => {
    const errors = analyze(formula).errors;
    expect(errors.map(e => e.code)).toContain('FORMULA_DIALECT_AMBIGUOUS_MARKER_NOT_ALLOWED');
    expect(
      errors.find(e => e.code === 'FORMULA_DIALECT_AMBIGUOUS_MARKER_NOT_ALLOWED')?.subject
    ).toBe(marker);
  });

  // Same carve-out the `;` guard gets: inside a string or a comment neither marker is a `punct`
  // token, so ordinary text keeps working.
  it('accepts a hash or double slash inside a string literal or a comment', () => {
    expect(analyze(`SUM({{ref field="x"}}) + LENGTH('#tag')`).errors).toEqual([]);
    expect(analyze(`SUM({{ref field="x"}}) + LENGTH('http://a')`).errors).toEqual([]);
    expect(analyze('SUM({{ref field="x"}}) -- see //docs and #1\n').errors).toEqual([]);
  });

  // Division is not a comment. Two `/` tokens only mean `//` when they adjoin, so an ordinary
  // chain of divisions must stay legal.
  it('accepts ordinary division, including a chain of it', () => {
    expect(analyze('SUM({{ref field="x"}}) / 2').errors).toEqual([]);
    expect(analyze('SUM({{ref field="x"}}) / 2 / 4').errors).toEqual([]);
  });

  // One violation per marker, however many times it appears — three hashes are one mistake.
  it('reports each ambiguous marker once', () => {
    const errors = analyze('SUM({{ref field="x"}}) # a # b # c').errors;
    expect(
      errors.filter(e => e.code === 'FORMULA_DIALECT_AMBIGUOUS_MARKER_NOT_ALLOWED')
    ).toHaveLength(1);
  });

  // THE GUARD BYPASS. Four warehouses read `\'` inside a literal as an escaped quote and
  // Athena/Trino does not, so the two readings close the literal in different places. Reading the
  // backslash as an ordinary character made the closing quote look like the opening half of a
  // doubled pair, and the whole formula collapsed into ONE string token — every structural guard
  // reads `punct`/`word`, so a subquery, a `;`, a top-level comma and a comment marker all became
  // invisible at once, while BigQuery ended the literal at the escaped quote and ran the tail.
  it.each([
    [
      'a subquery reading another dataset',
      `'a\\'', (SELECT ANY_VALUE(secret) FROM other.ds.customers)`,
    ],
    ['a statement separator', `'a\\''; DROP TABLE x`],
    ['a comment marker', `'a\\''# tail`],
    ['the same trick in double quotes', `"a\\"", (SELECT 1)`],
  ])('refuses %s smuggled past every guard by a backslash', (_case, formula) => {
    expect(analyze(formula).errors.map(e => e.code)).toContain(
      'FORMULA_DIALECT_AMBIGUOUS_ESCAPE_NOT_ALLOWED'
    );
  });

  // And the guards themselves must be able to see through the literal again: with the scanner
  // ending it where the warehouse does, the comma after it is an ordinary top-level `punct`.
  it('sees the top-level comma the backslash used to hide', () => {
    expect(analyze(`'a\\'', (SELECT 1)`).errors.map(e => e.code)).toEqual(
      expect.arrayContaining([
        'FORMULA_SUBQUERY_NOT_ALLOWED',
        'FORMULA_EXPRESSION_SEPARATOR_NOT_ALLOWED',
      ])
    );
  });

  // THE SAME BYPASS WITHOUT AN AMBIGUOUS CHARACTER. A quoting spelling this scanner does not know
  // — Snowflake `$$…$$`, BigQuery `'''…'''` — leaves an odd `'` behind, the run it opens never
  // closes, and one token covers the rest of the formula. The warehouse ends the text elsewhere and
  // reads a SECOND select item: an extra projected column, and an extra GROUP BY key on the
  // grouping path. Nothing else refuses it — the escape guard above needs a backslash, and the
  // comma guard cannot see a comma that is not a `punct` token.
  it.each([
    ['BigQuery triple quotes', `'''don't''' , other_col`],
    ['Snowflake dollar quoting', `LENGTH($$it's$$) , other_col`],
    ['nothing but an unclosed quote', `'never closed`],
    ['an unclosed block comment', `SUM({{ref field="x"}}) /* never closed`],
  ])('refuses a second select item smuggled past every guard by %s', (_case, formula) => {
    expect(analyze(formula).errors.map(e => e.code)).toContain(
      'FORMULA_UNTERMINATED_QUOTED_TEXT_NOT_ALLOWED'
    );
  });

  // The guard keys on the scanner state, not on `$`, so a dollar-quoted run holding no quote opens
  // nothing and stays legal — the false positive that would make the refusal useless.
  it('accepts a dollar-quoted run that leaves no quote open', () => {
    expect(analyze('CONCAT($$abc$$, {{ref field="x"}})').errors.map(e => e.code)).not.toContain(
      'FORMULA_UNTERMINATED_QUOTED_TEXT_NOT_ALLOWED'
    );
  });

  // And the guards must still see the comma when the quoting IS closed: written the portable way,
  // the same formula is refused for the reason it deserves.
  it('sees the top-level comma once the quoting closes', () => {
    expect(analyze(`'''don''t''' , other_col`).errors.map(e => e.code)).toEqual(
      expect.arrayContaining(['FORMULA_EXPRESSION_SEPARATOR_NOT_ALLOWED'])
    );
  });

  // A doubled quote is the escape all five agree about, so it stays legal text.
  it('accepts a quote written as two quotes', () => {
    expect(analyze(`SUM({{ref field="x"}}) + LENGTH('it''s')`).errors).toEqual([]);
  });

  // `"` opens a STRING on BigQuery and Databricks, so a tag inside one is text there — judged
  // live it would be substituted and published as a constant. Refused instead, which is correct
  // on all five: a reference has no meaning inside a quoted identifier either.
  //
  // A tag is ALWAYS serialized with double quotes, so this is the only spelling the editor can
  // produce for `MAX("clicks")` — and the tag's own quotes split the run into three tokens, so no
  // single token contains the tag. The single-quoted spelling below is unreachable in practice and
  // was for a while the only one pinned, which is how the double-quoted case passed as clean.
  it('refuses a reference tag inside double quotes, in the spelling the editor writes', () => {
    expect(analyze('MAX("{{ref field="x"}}")').errors.map(e => e.code)).toContain(
      'FORMULA_TAG_IN_STRING_LITERAL'
    );
  });

  it('refuses a reference tag inside double quotes, single-quoted tag spelling', () => {
    expect(analyze('SUM("{{ref field=\'x\'}}")').errors.map(e => e.code)).toContain(
      'FORMULA_TAG_IN_STRING_LITERAL'
    );
  });

  // A backtick run is a quoted identifier on BigQuery, and carries no quote of its own for the tag
  // to collide with — so this one IS contained, and must keep refusing for the same reason.
  it('refuses a reference tag inside backticks', () => {
    expect(analyze('MAX(`{{ref field="x"}}`)').errors.map(e => e.code)).toContain(
      'FORMULA_TAG_IN_STRING_LITERAL'
    );
  });

  // An extra `)` must not make the depth counter go negative and swallow the comma after it: the
  // formula is broken either way, but the refusal it gets has to be one that names something real.
  it('still rejects a top-level comma after an unbalanced closing parenthesis', () => {
    expect(analyze('SUM({{ref field="x"}})), {{ref field="y"}}').errors.map(e => e.code)).toContain(
      'FORMULA_EXPRESSION_SEPARATOR_NOT_ALLOWED'
    );
  });

  it('rejects a reference to a missing field', () => {
    expect(analyze('SUM({{ref field="gone"}})', () => 'missing').errors[0].code).toBe(
      'FORMULA_UNKNOWN_REFERENCE'
    );
  });

  it('rejects a tag inside a string literal', () => {
    expect(analyze(`SUM(CASE WHEN s = '{{ref field="x"}}' THEN 1 END)`).errors[0].code).toBe(
      'FORMULA_TAG_IN_STRING_LITERAL'
    );
  });

  it('warns, not errors, on an unguarded division', () => {
    const a = analyze('SUM({{ref field="a"}}) / SUM({{ref field="b"}})');
    expect(a.errors).toEqual([]);
    expect(a.warnings[0].code).toBe('FORMULA_UNGUARDED_DIVISION');
  });

  it('does not warn when the denominator is guarded', () => {
    expect(analyze('SUM({{ref field="a"}}) / NULLIF(SUM({{ref field="b"}}), 0)').warnings).toEqual(
      []
    );
  });

  // The example the policy comment above `hasUnguardedDivision` names in full: a guard around the
  // QUOTIENT is not a guard on the denominator, and the analyst still divides by zero. Pinned
  // because a containment test passes every other case here while silently accepting this one.
  it('still warns when the guard wraps the quotient rather than the denominator', () => {
    const a = analyze('COALESCE(SUM({{ref field="a"}}) / SUM({{ref field="b"}}), 0)');
    expect(a.warnings.map(w => w.code)).toEqual(['FORMULA_UNGUARDED_DIVISION']);
  });

  it('does not warn when a guarded denominator is wrapped in parens', () => {
    expect(
      analyze('SUM({{ref field="a"}}) / (NULLIF(SUM({{ref field="b"}}), 0))').warnings
    ).toEqual([]);
  });

  it('does not warn when the denominator is a numeric literal', () => {
    expect(analyze('SUM({{ref field="a"}}) / 100').warnings).toEqual([]);
    expect(analyze('SUM({{ref field="a"}}) / 0').warnings).toEqual([]);
  });

  it('reports every violation, not just the first', () => {
    const a = analyze('SUM({{ref field="a"}}) + {{ref field="cost"}} + (SELECT 1)');
    expect(a.errors.map(e => e.code)).toEqual(
      expect.arrayContaining(['FORMULA_LEVEL_MIXING', 'FORMULA_SUBQUERY_NOT_ALLOWED'])
    );
  });

  it('names the calculated field on a violation — the core "who does this belong to" promise', () => {
    const a = analyze('SUM({{ref field="a"}}) + {{ref field="cost"}}');
    expect(a.errors[0].field).toBe('ctr');
  });

  it('accepts a formula whose only content is a bare reference, with no aggregate at all', () => {
    const a = analyze('{{ref field="cost"}}');
    expect(a.level).toBe('column');
    expect(a.errors).toEqual([]);
    expect(a.aggregateCalls).toEqual([]);
  });

  it('accepts two aggregates over the same owner as two separate aggregateCalls, no error', () => {
    const a = analyze('SUM({{ref path="costs" field="a"}}) + SUM({{ref path="costs" field="b"}})');
    expect(a.errors).toEqual([]);
    expect(a.aggregateCalls.map(c => [c.name, c.owner])).toEqual([
      ['SUM', 'costs'],
      ['SUM', 'costs'],
    ]);
  });

  it('allows a CASE WHEN … THEN … END expression as an aggregate argument, over one owner', () => {
    const a = analyze(
      `SUM(CASE WHEN {{ref path="costs" field="source"}} = 'paid' ` +
        `THEN {{ref path="costs" field="spend"}} ELSE 0 END)`
    );
    expect(a.errors).toEqual([]);
    expect(a.aggregateCalls).toHaveLength(1);
    expect(a.aggregateCalls[0]).toEqual(expect.objectContaining({ name: 'SUM', owner: 'costs' }));
    expect(a.aggregateCalls[0].references.map(r => r.field)).toEqual(['source', 'spend']);
  });

  it("pins nameStart to the aggregate function name's offset, not its opening parenthesis", () => {
    const formula = 'SUM({{ref field="a"}})';
    const a = analyze(formula);
    expect(a.aggregateCalls[0].nameStart).toBe(formula.indexOf('SUM'));
  });

  it('dedupes repeated labels in the mixed-owners message', () => {
    const a = analyze('SUM({{ref field="a"}} + {{ref field="a"}} + {{ref path="c" field="b"}})');
    expect(a.errors[0].code).toBe('FORMULA_AGGREGATE_MIXES_OWNERS');
    expect(a.errors[0].message).not.toContain('`a` and `a`');
    expect(a.errors[0].message).toContain('`a` and `c.b`');
  });

  it('dedupes identical nested-aggregate errors from triple nesting', () => {
    const a = analyze('SUM(SUM(SUM({{ref field="x"}})))');
    expect(a.errors).toEqual([
      expect.objectContaining({
        code: 'FORMULA_NESTED_AGGREGATE',
        message: expect.stringContaining('`SUM`'),
      }),
    ]);
  });

  it('wraps a raw Handlebars parse error in an explanatory sentence, keeping the detail', () => {
    const a = analyze('{{date}}');
    expect(a.errors).toHaveLength(1);
    expect(a.errors[0].code).toBe('FORMULA_SYNTAX');
    expect(a.errors[0].field).toBe('ctr');
    expect(a.errors[0].message).toContain('could not be read');
    expect(a.errors[0].message).toContain('Unknown tag');
    expect(a.aggregateCalls).toEqual([]);
    expect(a.references).toEqual([]);
    expect(a.warnings).toEqual([]);
  });

  // Deliberate, pinned behaviour: comments are already dead text everywhere else in this module
  // — findFunctionCalls excludes them from call boundaries, hasUnguardedDivision skips them when
  // walking for a `/` — so reference containment has to match, or a tag left in a stray comment
  // produces a bogus level-mixing error for text nobody asked the warehouse to read.
  it('excludes a reference inside a SQL comment from every reference-level check, including level mixing', () => {
    const a = analyze('SUM({{ref field="a"}}) -- {{ref field="b"}}');
    expect(a.errors).toEqual([]);
    expect(a.aggregateCalls.map(c => [c.name, c.owner])).toEqual([['SUM', '']]);
  });

  it("excludes a comment-embedded reference from an aggregate's owner resolution, so it cannot falsely mix owners", () => {
    const a = analyze('SUM({{ref field="a"}} /* + {{ref path="costs" field="b"}} */)');
    expect(a.errors).toEqual([]);
    expect(a.aggregateCalls).toEqual([expect.objectContaining({ name: 'SUM', owner: '' })]);
    expect(a.aggregateCalls[0].references.map(r => r.field)).toEqual(['a']);
  });

  it("excludes a comment-embedded reference from a resolved call's reference list, so it cannot silently join the dependency set", () => {
    const a = analyze('SUM({{ref field="a"}} /* + {{ref field="b"}} */)');
    expect(a.errors).toEqual([]);
    expect(a.aggregateCalls[0].references.map(r => r.field)).toEqual(['a']);
  });

  it('excludes a reference inside a string literal from knownField, containment and level mixing — exactly one error', () => {
    const known = (_path: string, field: string) =>
      field === 'x' ? ('missing' as const) : ('ok' as const);
    const a = analyze(`SUM({{ref field="a"}}) + '{{ref field="x"}}'`, known);
    expect(a.errors).toEqual([expect.objectContaining({ code: 'FORMULA_TAG_IN_STRING_LITERAL' })]);
  });

  it('reports unbalanced parenthesis, not "no field", for an unclosed aggregate call — exactly one error', () => {
    const a = analyze('COUNT({{ref field="x"}}');
    expect(a.errors).toEqual([expect.objectContaining({ code: 'FORMULA_UNBALANCED_PARENTHESIS' })]);
  });

  it("does not flag a live sibling aggregate's reference as level mixing when a later aggregate call is unclosed", () => {
    const a = analyze('SUM({{ref field="a"}}) + COUNT({{ref path="costs" field="b"}}');
    expect(a.errors).toEqual([expect.objectContaining({ code: 'FORMULA_UNBALANCED_PARENTHESIS' })]);
    expect(a.aggregateCalls.map(c => [c.name, c.owner])).toEqual([['SUM', '']]);
  });

  // Unique Count (and any measure) is already an aggregate — wrapping it in another
  // one double-counts a number that is already per-group.
  it('rejects wrapping an already-aggregated reference in another aggregate call', () => {
    const known = (_path: string, field: string) =>
      field === 'unique_count' ? ('aggregate' as const) : ('ok' as const);
    const a = analyze('SUM({{ref path="costs" field="unique_count"}})', known);
    expect(a.errors).toEqual([expect.objectContaining({ code: 'FORMULA_AGGREGATE_ON_AGGREGATE' })]);
    expect(a.errors[0].message).toContain('`costs.unique_count`');
  });

  it('allows an already-aggregated reference used outside any aggregate call, without level mixing', () => {
    const known = (_path: string, field: string) =>
      field === 'unique_count' ? ('aggregate' as const) : ('ok' as const);
    const a = analyze('SUM({{ref field="a"}}) / {{ref path="costs" field="unique_count"}}', known);
    expect(a.errors).toEqual([]);
    expect(a.aggregateCalls.map(c => [c.name, c.owner])).toEqual([['SUM', '']]);
  });

  it('reports level column for a formula with no aggregate at all', () => {
    const a = analyze('CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})');
    expect(a.level).toBe('column');
    expect(a.errors).toEqual([]);
  });

  it('reports level metric when any aggregate is present', () => {
    const a = analyze('SUM({{ref field="cost"}}) * 2');
    expect(a.level).toBe('metric');
    expect(a.errors).toEqual([]);
  });

  it('still refuses a bare reference beside an aggregate, which is level metric', () => {
    const a = analyze('SUM({{ref field="cost"}}) + {{ref field="clicks"}}');
    expect(a.level).toBe('metric');
    expect(a.errors).toEqual([expect.objectContaining({ code: 'FORMULA_LEVEL_MIXING' })]);
  });

  it('refuses a joined reference read at row level', () => {
    const a = analyze('CONCAT({{ref field="session_id"}}, {{ref path="orders" field="status"}})');
    expect(a.level).toBe('column');
    expect(a.errors).toEqual([
      expect.objectContaining({
        code: 'FORMULA_JOINED_REFERENCE_ROW_LEVEL',
        subject: 'orders.status',
      }),
    ]);
  });

  // The refusal is checked apart from the reference-state chain, so no state can claim the
  // reference first and let it through. 'aggregate' is the state that did: a JOINED Unique Count
  // is refused out of band by the validator today, but that restriction is a slice-1 limit the
  // roadmap intends to lift, while the other is permanent — so the permanent rule must not depend
  // on the temporary one still being there.
  it('refuses a joined reference at row level whatever the reference state', () => {
    const known = (_path: string, field: string) =>
      field === 'unique_count' ? ('aggregate' as const) : ('ok' as const);

    for (const formula of [
      '{{ref path="costs" field="unique_count"}} + 1',
      'CONCAT({{ref field="x"}}, {{ref path="costs" field="unique_count"}})',
    ]) {
      const a = analyze(formula, known);
      expect(a.level).toBe('column');
      expect(a.errors).toEqual([
        expect.objectContaining({
          code: 'FORMULA_JOINED_REFERENCE_ROW_LEVEL',
          subject: 'costs.unique_count',
        }),
      ]);
    }
  });

  it('reports level column for a formula that mentions no field at all', () => {
    expect(analyze("'n/a'").level).toBe('column');
  });

  // The level reads the CALL list, not the resolved `aggregateCalls`: an aggregate that failed its
  // own rules resolves to nothing, yet the formula is still a metric — and the caller needs that to
  // pick which message the analyst gets.
  it('reports level metric even when the only aggregate call was rejected', () => {
    const a = analyze('COUNT(*)');
    expect(a.level).toBe('metric');
    expect(a.aggregateCalls).toEqual([]);
    expect(a.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_AGGREGATE_WITHOUT_FIELD' }),
    ]);
  });

  // Level = 'metric' iff the formula contains an aggregate call OR references a
  // Calculated Field whose own level is 'metric'. B's aggregation lives in B's string, so A's own
  // token stream can never see it — the transitive half is only answerable once the references have
  // been resolved, which is why the derivation had to move below the resolution.
  it('reports level metric for a formula whose only aggregation is inside a referenced calculated field', () => {
    const a = analyze('{{ref field="revenue"}} / {{ref field="cost"}}', () => 'calculated-metric');
    expect(a.level).toBe('metric');
  });

  it('leaves level column when the referenced calculated field is itself row-level', () => {
    const a = analyze(`CONCAT({{ref field="full_name"}}, '!')`, () => 'calculated-column');
    expect(a.level).toBe('column');
    expect(a.errors).toEqual([]);
  });

  // THE formula this whole feature exists for. A calculated reference is bare by construction, so
  // the moment the transitive rule makes this metric-level, the `level === 'metric' && !covered`
  // arm claims BOTH references unless the new state is judged ahead of it.
  it('reports no level mixing for two bare aggregate-level calculated references', () => {
    const a = analyze('{{ref field="revenue"}} / {{ref field="cost"}}', () => 'calculated-metric');
    expect(a.errors).toEqual([]);
  });

  it('rejects wrapping an aggregate-level calculated reference in another aggregate call', () => {
    const a = analyze('SUM({{ref field="roas"}})', () => 'calculated-metric');
    expect(a.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_AGGREGATE_ON_AGGREGATE', subject: 'roas' }),
    ]);
    // Not the already-a-measure wording: the fix lives in ANOTHER formula, and the analyst has to
    // be told which kind of object to go and look at.
    expect(a.errors[0].message).toContain('calculated field');
  });

  it('still refuses a bare row-level calculated reference beside an aggregate', () => {
    const known = (_path: string, field: string) =>
      field === 'full_name' ? ('calculated-column' as const) : ('ok' as const);
    const a = analyze('SUM({{ref field="cost"}}) + {{ref field="full_name"}}', known);
    expect(a.level).toBe('metric');
    expect(a.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_LEVEL_MIXING', subject: 'full_name' }),
    ]);
  });

  // PERMANENT: a formula may not read ANOTHER Data Mart's formula, whatever level
  // that formula has. This passed with ZERO errors when the levelled states arrived — the metric
  // level is exactly what disables the row-level joined guard above, and the calculated-metric arm
  // then claimed the reference. Unreachable while the validator refuses a joined calculated
  // reference out of band, which is precisely why the permanent rule needs a test of its own.
  it('refuses a JOINED calculated reference at either level', () => {
    for (const state of ['calculated-metric', 'calculated-column'] as const) {
      const a = analyze('{{ref path="orders" field="roas"}} + 1', () => state);
      // A refused reference contributes no level either: only an OWN-Data-Mart calculated field
      // can make this formula a metric, so the permanent row-level joined guard still fires too.
      expect(a.level).toBe('column');
      expect(a.errors).toEqual([
        expect.objectContaining({
          code: 'FORMULA_JOINED_REFERENCE_ROW_LEVEL',
          subject: 'orders.roas',
        }),
        expect.objectContaining({ code: 'FORMULA_CALCULATED_REFERENCE', subject: 'orders.roas' }),
      ]);
    }
  });

  // The own-Data-Mart refusal is the one lifted: two bare aggregate-level calculated references
  // save clean and make the formula a metric (pinned above), and this is the same formula reaching
  // for a JOINED one inside an aggregate — still refused, so nothing about the lift is symmetric.
  it('refuses a joined calculated reference even inside an aggregate call', () => {
    const a = analyze('SUM({{ref path="orders" field="roas"}})', () => 'calculated-metric');
    expect(a.errors).toEqual([
      expect.objectContaining({ code: 'FORMULA_CALCULATED_REFERENCE', subject: 'orders.roas' }),
      expect.objectContaining({
        code: 'FORMULA_AGGREGATE_ON_AGGREGATE',
        subject: 'orders.roas',
      }),
    ]);
  });

  // The early return never built a reference list, so neither half of the rule has anything to read
  // — 'column' stays the only answer consistent with it, whatever knownField would have said.
  it('reports level column from the Handlebars early return, whatever knownField would have said', () => {
    const a = analyze('{{date}}', () => 'calculated-metric');
    expect(a.level).toBe('column');
    expect(a.errors[0].code).toBe('FORMULA_SYNTAX');
  });

  // A COMPLEXITY guard, not a benchmark. Liveness used to be re-derived per aggregate call over the
  // whole token list — three scans each — so the cost grew as calls x references x tokens: measured
  // at 2.4 s for one formula of the maximum allowed length, on a synchronous path that analyses up
  // to 100 drafts per request with no `await` in between. One authenticated request could hold the
  // event loop for minutes, and in the managed deployment that pod is shared.
  //
  // The bound is deliberately ~100x the measured 10 ms rather than tight: what must fail here is a
  // return to the quadratic class, which overshoots it by two orders of magnitude, not a slow CI
  // runner.
  it('analyses a maximum-length formula without quadratic blow-up', () => {
    const formula = 'SUM({{ref field="a"}})+'.repeat(434).slice(0, -1);
    expect(formula.length).toBeLessThanOrEqual(10_000);

    const startedAt = performance.now();
    const a = analyze(formula);
    const elapsedMs = performance.now() - startedAt;

    expect(a.errors).toEqual([]);
    expect(elapsedMs).toBeLessThan(1000);
  });
});
