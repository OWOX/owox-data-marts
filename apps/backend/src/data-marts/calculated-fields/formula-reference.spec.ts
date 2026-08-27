import {
  FormulaCycleError,
  FormulaExpansionGuard,
  FormulaReference,
  FormulaReferenceSyntaxError,
  parseFormulaReferences,
  renderFormula,
  renderFormulaWithReplacements,
  serializeFormulaReference,
  walkFormulaDependencies,
} from './formula-reference';

describe('parseFormulaReferences', () => {
  it('reads path and field with positions', () => {
    const refs = parseFormulaReferences(
      'SUM({{ref field="clicks"}}) / SUM({{ref path="costs" field="impressions"}})'
    );
    expect(refs).toEqual([
      expect.objectContaining({ path: '', field: 'clicks' }),
      expect.objectContaining({ path: 'costs', field: 'impressions' }),
    ]);
  });

  it('keeps a dotted field name intact', () => {
    expect(parseFormulaReferences('{{ref field="payload.value"}}')[0].field).toBe('payload.value');
  });

  it('rejects an unknown tag', () => {
    expect(() => parseFormulaReferences('{{date}}')).toThrow(FormulaReferenceSyntaxError);
  });

  it('rejects a triple-stash reference', () => {
    expect(() => parseFormulaReferences('{{{ref field="x"}}}')).toThrow(
      FormulaReferenceSyntaxError
    );
  });

  it('rejects a non-string hash value', () => {
    expect(() => parseFormulaReferences('{{ref field=123}}')).toThrow(FormulaReferenceSyntaxError);
  });

  it('sets the error name on a thrown syntax error', () => {
    expect.assertions(1);
    try {
      parseFormulaReferences('{{date}}');
    } catch (e) {
      expect((e as Error).name).toBe('FormulaReferenceSyntaxError');
    }
  });

  it('returns an empty array for a formula with no references at all', () => {
    expect(parseFormulaReferences('1 + 1')).toEqual([]);
  });

  it('reads two references adjacent with nothing between them', () => {
    const stored = '{{ref field="a"}}{{ref field="b"}}';
    const refs = parseFormulaReferences(stored);
    expect(refs).toEqual([
      expect.objectContaining({ path: '', field: 'a' }),
      expect.objectContaining({ path: '', field: 'b' }),
    ]);
    // adjacent tags must not overlap and must not swallow each other
    expect(refs[0].end).toBe(refs[1].start);
    expect(stored.slice(refs[0].start, refs[0].end)).toBe('{{ref field="a"}}');
    expect(stored.slice(refs[1].start, refs[1].end)).toBe('{{ref field="b"}}');
  });

  it('reports offsets that round-trip through String.slice', () => {
    const stored = 'SUM({{ref path="costs" field="impressions"}})';
    const [ref] = parseFormulaReferences(stored);
    expect(stored.slice(ref.start, ref.end)).toBe('{{ref path="costs" field="impressions"}}');
  });
});

describe('line-break handling', () => {
  // Handlebars' lexer advances loc.line on `\r\n`, a lone `\r`, or `\n` alike (its regex is
  // `/(?:\r\n?|\n).*/g`). buildLineOffsets must recognise the same three forms, or a reference
  // after a lone `\r` resolves to a NaN offset and renderFormula silently garbles its output.
  it('resolves correct offsets across a lone \\r line break', () => {
    const stored = 'PRE\rSUM({{ref field="a"}}) + SUM({{ref field="b"}})';
    const refs = parseFormulaReferences(stored);
    expect(refs).toHaveLength(2);
    expect(stored.slice(refs[0].start, refs[0].end)).toBe('{{ref field="a"}}');
    expect(stored.slice(refs[1].start, refs[1].end)).toBe('{{ref field="b"}}');
  });

  it('renders correctly across a lone \\r line break instead of leaking raw tags', () => {
    const stored = 'PRE\rSUM({{ref field="a"}}) + SUM({{ref field="b"}})';
    const out = renderFormula(stored, ref => `col_${ref.field}`);
    expect(out).toBe('PRE\rSUM(col_a) + SUM(col_b)');
  });

  it('resolves a reference on the first line', () => {
    const stored = '{{ref field="a"}}';
    const [ref] = parseFormulaReferences(stored);
    expect(stored.slice(ref.start, ref.end)).toBe('{{ref field="a"}}');
  });

  it('resolves a reference after \\n', () => {
    const stored = 'SUM(x)\n+ {{ref field="a"}}';
    const [ref] = parseFormulaReferences(stored);
    expect(stored.slice(ref.start, ref.end)).toBe('{{ref field="a"}}');
  });

  it('resolves a reference after \\r\\n', () => {
    const stored = 'SUM(x)\r\n+ {{ref field="a"}}';
    const [ref] = parseFormulaReferences(stored);
    expect(stored.slice(ref.start, ref.end)).toBe('{{ref field="a"}}');
  });

  it('resolves a reference after a lone \\r', () => {
    const stored = 'SUM(x)\r+ {{ref field="a"}}';
    const [ref] = parseFormulaReferences(stored);
    expect(stored.slice(ref.start, ref.end)).toBe('{{ref field="a"}}');
  });

  it('resolves a reference at the very end of the string', () => {
    const stored = 'SUM(x) + {{ref field="a"}}';
    const [ref] = parseFormulaReferences(stored);
    expect(ref.end).toBe(stored.length);
    expect(stored.slice(ref.start, ref.end)).toBe('{{ref field="a"}}');
  });
});

describe('renderFormula', () => {
  it('substitutes each reference and leaves the rest byte-identical', () => {
    const out = renderFormula(
      'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
      ref => `main.${ref.field}`
    );
    expect(out).toBe('SUM(main.clicks) / NULLIF(SUM(main.impressions), 0)');
  });

  it('returns the input untouched when there are no references', () => {
    const out = renderFormula('1 + 1', () => {
      throw new Error('resolve should never be called');
    });
    expect(out).toBe('1 + 1');
  });

  it('does not re-parse a resolver result that itself contains {{', () => {
    const out = renderFormula('{{ref field="a"}} + {{ref field="b"}}', ref =>
      ref.field === 'a' ? '{{ref field="not-a-real-reference"}}' : 'b_col'
    );
    expect(out).toBe('{{ref field="not-a-real-reference"}} + b_col');
  });
});

describe('renderFormulaWithReplacements', () => {
  it('replaces a whole span and skips the references inside it', () => {
    const stored = `SUM({{ref field="cost"}}) * SUM({{ref path="orders" field="amount"}})`;
    const start = stored.indexOf('SUM({{ref path');
    const out = renderFormulaWithReplacements(stored, ref => `main."${ref.field}"`, [
      { start, end: stored.length, sql: 'ANY_VALUE(sleeve_1."_val")' },
    ]);
    expect(out).toBe('SUM(main."cost") * ANY_VALUE(sleeve_1."_val")');
  });

  it('throws on overlapping replacements', () => {
    const stored = `SUM({{ref field="cost"}})`;
    expect(() =>
      renderFormulaWithReplacements(stored, () => 'x', [
        { start: 0, end: 10, sql: 'a' },
        { start: 5, end: 15, sql: 'b' },
      ])
    ).toThrow(/overlap/i);
  });

  it('renders identically to renderFormula when there are no replacements', () => {
    const stored = `SUM({{ref field="cost"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)`;
    const resolve = (ref: FormulaReference) => `main."${ref.field}"`;
    expect(renderFormulaWithReplacements(stored, resolve, [])).toBe(renderFormula(stored, resolve));
  });

  it('flushes two non-overlapping replacements around a reference, in the order given', () => {
    const stored = `{{ref field="a"}} + AAA + BBB + {{ref field="b"}}`;
    const start1 = stored.indexOf('AAA');
    const start2 = stored.indexOf('BBB');
    const out = renderFormulaWithReplacements(stored, ref => `main."${ref.field}"`, [
      { start: start1, end: start1 + 3, sql: 'sleeve_1."_val"' },
      { start: start2, end: start2 + 3, sql: 'sleeve_2."_val"' },
    ]);
    expect(out).toBe('main."a" + sleeve_1."_val" + sleeve_2."_val" + main."b"');
  });

  it('renders the same result when those two replacements are passed in reverse order', () => {
    const stored = `{{ref field="a"}} + AAA + BBB + {{ref field="b"}}`;
    const start1 = stored.indexOf('AAA');
    const start2 = stored.indexOf('BBB');
    const out = renderFormulaWithReplacements(stored, ref => `main."${ref.field}"`, [
      { start: start2, end: start2 + 3, sql: 'sleeve_2."_val"' },
      { start: start1, end: start1 + 3, sql: 'sleeve_1."_val"' },
    ]);
    expect(out).toBe('main."a" + sleeve_1."_val" + sleeve_2."_val" + main."b"');
  });

  it('does not throw for genuinely adjacent replacement spans', () => {
    const stored = '0123456789';
    const out = renderFormulaWithReplacements(stored, () => 'unused', [
      { start: 0, end: 5, sql: 'A' },
      { start: 5, end: 9, sql: 'B' },
    ]);
    expect(out).toBe('AB9');
  });

  it('replaces a span that contains no references at all', () => {
    const stored = 'CASE WHEN x > 0 THEN 1 ELSE 0 END';
    const out = renderFormulaWithReplacements(stored, () => {
      throw new Error('resolve should never be called');
    }, [{ start: 0, end: stored.length, sql: 'sleeve_1."_val"' }]);
    expect(out).toBe('sleeve_1."_val"');
  });

  it('throws when a replacement span partially overlaps a reference instead of fully containing it', () => {
    const stored = `SUM({{ref field="cost"}})`;
    const ref = parseFormulaReferences(stored)[0];
    const badEnd = ref.start + 3;
    expect(() =>
      renderFormulaWithReplacements(stored, () => 'x', [{ start: 0, end: badEnd, sql: 'a' }])
    ).toThrow(/overlap/i);
  });
});

describe('serializeFormulaReference', () => {
  it('throws instead of producing an injection-shaped tag when field contains a quote', () => {
    expect(() => serializeFormulaReference({ path: '', field: 'a" path="evil' })).toThrow(
      FormulaReferenceSyntaxError
    );
  });

  it('throws when path contains a double quote', () => {
    expect(() => serializeFormulaReference({ path: 'a"b', field: 'x' })).toThrow(
      FormulaReferenceSyntaxError
    );
  });

  // Handlebars leaves a backslash alone EXCEPT before a quote, so a value ending in one runs into
  // the closing quote and the lexer reads on through the rest of the formula: the tag below does
  // not re-parse at all. Refused rather than escaped because there is no escape to use — `\\` is
  // two literal backslashes to this parser, not one — and the canonicalization and alias-rename
  // seats both re-serialize and PERSIST whatever comes back, with no gate in between.
  it('throws when field ends in a backslash, which no tag can represent', () => {
    expect(() => serializeFormulaReference({ path: '', field: 'a\\' })).toThrow(
      FormulaReferenceSyntaxError
    );
  });

  it('throws when path ends in a backslash', () => {
    expect(() => serializeFormulaReference({ path: 'orders\\', field: 'amount' })).toThrow(
      FormulaReferenceSyntaxError
    );
  });

  // Only the LAST character is ambiguous. A backslash anywhere else is ordinary text to the
  // parser, so refusing every backslash would refuse a column the feature can serve.
  it('keeps an interior backslash, which round-trips unchanged', () => {
    const tag = serializeFormulaReference({ path: '', field: 'a\\b' });
    expect(parseFormulaReferences(`${tag} / {{ref field="c"}}`)[0]).toEqual(
      expect.objectContaining({ path: '', field: 'a\\b' })
    );
  });
});

describe('round trip', () => {
  it('serialize → parse returns the same pair', () => {
    const tag = serializeFormulaReference({ path: 'a.b', field: 'x.y' });
    expect(parseFormulaReferences(tag)[0]).toEqual(
      expect.objectContaining({ path: 'a.b', field: 'x.y' })
    );
  });

  it('serialize → parse survives a dotted field with an empty path', () => {
    const tag = serializeFormulaReference({ path: '', field: 'payload.value' });
    expect(tag).toBe('{{ref field="payload.value"}}');
    expect(parseFormulaReferences(tag)[0]).toEqual(
      expect.objectContaining({ path: '', field: 'payload.value' })
    );
  });
});

const graph = (entries: Record<string, string[]>): ReadonlyMap<string, readonly string[]> =>
  new Map(Object.entries(entries));

describe('walkFormulaDependencies', () => {
  // Self-reference used to be caught only INCIDENTALLY, by the refusal on reading any calculated
  // field at all; this is what replaced that when the refusal lifted, so it is the first case.
  it('reports a self-reference as a cycle', () => {
    expect(walkFormulaDependencies(graph({ a: ['a'] })).cycles).toEqual([['a', 'a']]);
  });

  it('reports a two-field cycle, naming both fields on it', () => {
    expect(walkFormulaDependencies(graph({ a: ['b'], b: ['a'] })).cycles).toEqual([
      ['a', 'b', 'a'],
    ]);
  });

  it('reports a three-hop cycle, naming every field on it', () => {
    expect(walkFormulaDependencies(graph({ a: ['b'], b: ['c'], c: ['a'] })).cycles).toEqual([
      ['a', 'b', 'c', 'a'],
    ]);
  });

  // THE mutation this whole walk has to survive: a plain visited set that never unwinds calls a
  // diamond a cycle, and a diamond is legal — two formulas may read the same third one.
  it('does not report a diamond, where two fields read the same third one', () => {
    const walk = walkFormulaDependencies(graph({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }));
    expect(walk.cycles).toEqual([]);
  });

  // Kills "return the map's keys in their own order": `a` is first in the map and last in the order.
  it('yields an order with every dependency ahead of its dependants', () => {
    const walk = walkFormulaDependencies(graph({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }));
    expect(walk.order).toEqual(['d', 'b', 'c', 'a']);
  });

  // Kills "order only what a root reaches": the map's keys are all walked, not just the first.
  it('orders a field no other field depends on', () => {
    expect(walkFormulaDependencies(graph({ a: ['b'], b: [], c: [] })).order).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  // A reference to an ordinary column: not a key of the map, so it has no formula to walk into and
  // never appears in an order of calculated fields.
  it('treats a dependency that is not itself in the graph as a leaf', () => {
    const walk = walkFormulaDependencies(graph({ a: ['clicks'] }));
    expect(walk).toEqual({ order: ['a'], cycles: [] });
  });

  // Kills "only report a cycle the walk STARTS on": `a` is walked first and is not on the loop.
  it('reports a cycle reached only through a field outside it', () => {
    expect(walkFormulaDependencies(graph({ a: ['b'], b: ['c'], c: ['b'] })).cycles).toEqual([
      ['b', 'c', 'b'],
    ]);
  });

  it('reports two independent cycles separately', () => {
    expect(
      walkFormulaDependencies(graph({ a: ['b'], b: ['a'], c: ['d'], d: ['c'] })).cycles
    ).toEqual([
      ['a', 'b', 'a'],
      ['c', 'd', 'c'],
    ]);
  });

  // Kills "report the cycle once per field that can reach it": one back edge, one report.
  it('reports one cycle once however many fields lead into it', () => {
    expect(
      walkFormulaDependencies(graph({ a: ['c'], b: ['c'], c: ['d'], d: ['c'] })).cycles
    ).toEqual([['c', 'd', 'c']]);
  });

  it('returns nothing at all for an empty graph', () => {
    expect(walkFormulaDependencies(graph({}))).toEqual({ order: [], cycles: [] });
  });

  // Kills "emit the order anyway when a cycle was found". Measured on the previous code, this exact
  // graph returned `order: ['b','a','c']` — plausible, non-empty, and NOT topological (`a` sits
  // after `b` although `b` depends on `a`). The save path derives each field's level in this order,
  // so a wrong order is a wrong level, a wrong GROUP BY and a wrong NUMBER rather than an error.
  it('returns no order at all when the graph holds a cycle', () => {
    const walk = walkFormulaDependencies(graph({ a: ['b'], b: ['a'], c: ['a'] }));
    expect(walk.cycles).toEqual([['a', 'b', 'a']]);
    expect(walk.order).toBeUndefined();
  });
});

describe('FormulaExpansionGuard', () => {
  // The compose-time recursion in miniature: resolving a reference renders THAT field's formula,
  // whose own resolver is a fresh closure — which is why a depth counter local to
  // renderFormulaWithReplacements sees nothing, and the guard has to be carried across re-entries.
  const expanderOver = (formulas: Record<string, string>) => {
    const guard = new FormulaExpansionGuard();
    const render = (name: string): string =>
      guard.expand(name, () =>
        renderFormula(formulas[name] ?? name, ref => `(${render(ref.field)})`)
      );
    return render;
  };

  it('refuses a formula that references itself rather than overflowing the stack', () => {
    expect(() => expanderOver({ a: '{{ref field="a"}} + 1' })('a')).toThrow(FormulaCycleError);
  });

  it('names the field and the whole chain of a two-field cycle', () => {
    expect.assertions(2);
    try {
      expanderOver({ a: '{{ref field="b"}}', b: '{{ref field="a"}}' })('a');
    } catch (e) {
      expect((e as FormulaCycleError).field).toBe('a');
      expect((e as FormulaCycleError).chain).toEqual(['a', 'b', 'a']);
    }
  });

  it('names the field it re-entered, not the field the render started from', () => {
    expect.assertions(2);
    try {
      expanderOver({ a: '{{ref field="b"}}', b: '{{ref field="c"}}', c: '{{ref field="b"}}' })('a');
    } catch (e) {
      expect((e as FormulaCycleError).field).toBe('b');
      expect((e as FormulaCycleError).chain).toEqual(['b', 'c', 'b']);
    }
  });

  // A caller converts this into a refusal naming the field, exactly as `analyzeFormula` converts a
  // FormulaReferenceSyntaxError — a 500 with no field name is the outcome the guard exists to avoid.
  it('sets the error name so a caller can tell it apart from an ordinary failure', () => {
    expect.assertions(1);
    try {
      expanderOver({ a: '{{ref field="a"}}' })('a');
    } catch (e) {
      expect((e as Error).name).toBe('FormulaCycleError');
    }
  });

  // THE mutation: a visited set that never unwinds refuses the second `d` here. Nothing memoizes at
  // compose time — `d` really is expanded twice — so the pop is the only thing keeping it legal.
  it('expands the same field twice on different branches — a diamond is not a cycle', () => {
    const render = expanderOver({
      a: '{{ref field="b"}} + {{ref field="c"}}',
      b: '{{ref field="d"}}',
      c: '{{ref field="d"}}',
      d: 'raw_d',
    });
    expect(render('a')).toBe('((raw_d)) + ((raw_d))');
  });

  it('lets a field be expanded again once its first expansion has finished', () => {
    const guard = new FormulaExpansionGuard();
    expect(guard.expand('a', () => 1)).toBe(1);
    expect(guard.expand('a', () => 2)).toBe(2);
  });

  // Without the unwind on the failure path, one rejected formula would make every later reference
  // to that same field look like a cycle.
  it('releases the field even when rendering it throws', () => {
    const guard = new FormulaExpansionGuard();
    expect(() =>
      guard.expand('a', () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(guard.cycleFor('a')).toBeUndefined();
  });

  it('reports no cycle for a field nothing is expanding', () => {
    expect(new FormulaExpansionGuard().cycleFor('a')).toBeUndefined();
  });
});
