import { toAuthoringForm, toStoredForm } from './formula-authoring';

describe('toStoredForm', () => {
  it('replaces each resolved span with a tag and leaves the rest byte-identical', () => {
    const authoring = 'SUM(clicks) / NULLIF(SUM(impressions), 0)';
    const refs = [
      { text: 'clicks', start: 4, end: 10, path: '', field: 'clicks' },
      { text: 'impressions', start: 25, end: 36, path: '', field: 'impressions' },
    ];
    expect(toStoredForm(authoring, refs)).toBe(
      'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)'
    );
  });

  it('applies spans right-to-left so earlier offsets stay valid', () => {
    // A left-to-right implementation shifts every later span by the length delta and corrupts them.
    const authoring = 'a + b';
    const refs = [
      { text: 'a', start: 0, end: 1, path: '', field: 'a' },
      { text: 'b', start: 4, end: 5, path: '', field: 'b' },
    ];
    expect(toStoredForm(authoring, refs)).toBe('{{ref field="a"}} + {{ref field="b"}}');
  });

  it('rejects a reference whose field carries a double quote', () => {
    expect(() =>
      toStoredForm('x', [{ text: 'x', start: 0, end: 1, path: '', field: 'we"ird' }])
    ).toThrow();
  });

  it('rejects a reference whose path carries a double quote', () => {
    expect(() =>
      toStoredForm('x', [{ text: 'x', start: 0, end: 1, path: 'we"ird', field: 'x' }])
    ).toThrow();
  });

  it('passes a formula with no references through unchanged', () => {
    const authoring = '1 + 1';
    expect(toStoredForm(authoring, [])).toBe(authoring);
  });

  it('replaces two adjacent references with nothing between them', () => {
    const authoring = 'ab';
    const refs = [
      { text: 'a', start: 0, end: 1, path: '', field: 'a' },
      { text: 'b', start: 1, end: 2, path: '', field: 'b' },
    ];
    expect(toStoredForm(authoring, refs)).toBe('{{ref field="a"}}{{ref field="b"}}');
  });

  it('keeps a dotted field name intact in the tag', () => {
    const authoring = 'SUM(payload.value)';
    const refs = [{ text: 'payload.value', start: 4, end: 17, path: '', field: 'payload.value' }];
    expect(toStoredForm(authoring, refs)).toBe('SUM({{ref field="payload.value"}})');
  });

  it('keeps a field value containing literal braces intact in the tag', () => {
    // A warehouse column name carries no character restriction (BigQuery flexible column names,
    // Snowflake/Databricks quoted identifiers), so it can contain "}}" itself.
    const authoring = 'SUM(a}}b)';
    const refs = [{ text: 'a}}b', start: 4, end: 8, path: '', field: 'a}}b' }];
    expect(toStoredForm(authoring, refs)).toBe('SUM({{ref field="a}}b"}})');
  });
});

describe('toAuthoringForm', () => {
  it('renders each tag under the field name the resolver gives it', () => {
    const { text, refs } = toAuthoringForm(
      'SUM({{ref field="clicks"}}) / SUM({{ref path="costs" field="spend"}})',
      ref => (ref.path ? `${ref.path}.${ref.field}` : ref.field)
    );
    expect(text).toBe('SUM(clicks) / SUM(costs.spend)');
    expect(refs.map(r => [r.text, r.start, r.end])).toEqual([
      ['clicks', 4, 10],
      ['costs.spend', 18, 29],
    ]);
  });

  it('round-trips', () => {
    const stored = 'SUM({{ref field="a"}}) / NULLIF(SUM({{ref field="b"}}), 0)';
    const { text, refs } = toAuthoringForm(stored, r => r.field);
    expect(toStoredForm(text, refs)).toBe(stored);
  });

  it('passes a formula with no references through unchanged', () => {
    const stored = '1 + 1';
    const { text, refs } = toAuthoringForm(stored, () => {
      throw new Error('nameOf should never be called');
    });
    expect(text).toBe(stored);
    expect(refs).toEqual([]);
    // Composed: converting back must reproduce the original stored string exactly.
    expect(toStoredForm(text, refs)).toBe(stored);
  });

  it('resolves two adjacent tags with nothing between them', () => {
    const stored = '{{ref field="a"}}{{ref field="b"}}';
    const { text, refs } = toAuthoringForm(stored, r => r.field);
    expect(text).toBe('ab');
    expect(refs.map(r => [r.text, r.start, r.end])).toEqual([
      ['a', 0, 1],
      ['b', 1, 2],
    ]);
    expect(toStoredForm(text, refs)).toBe(stored);
  });

  it('keeps a dotted field name intact when resolving a tag', () => {
    const stored = '{{ref field="payload.value"}}';
    const { text, refs } = toAuthoringForm(stored, r => r.field);
    expect(text).toBe('payload.value');
    expect(refs).toEqual([
      { text: 'payload.value', start: 0, end: 13, path: '', field: 'payload.value' },
    ]);
    expect(toStoredForm(text, refs)).toBe(stored);
  });

  it('reads a mix of tags with and without a path in the same formula', () => {
    const stored = 'SUM({{ref path="costs" field="spend"}}) + SUM({{ref field="clicks"}})';
    const { text, refs } = toAuthoringForm(stored, r => r.field);
    expect(refs.map(r => [r.path, r.field])).toEqual([
      ['costs', 'spend'],
      ['', 'clicks'],
    ]);
    expect(toStoredForm(text, refs)).toBe(stored);
  });

  it('does not truncate the tag at a "}}" inside a quoted field value', () => {
    // A warehouse column name carries no character restriction and can itself contain "}}"; the
    // pattern is quote-delimited, not brace-delimited, so this must not truncate at the first "}".
    const stored = 'SUM({{ref field="a}}b"}})';
    const { text, refs } = toAuthoringForm(stored, r => r.field);
    expect(text).toBe('SUM(a}}b)');
    expect(refs).toEqual([{ text: 'a}}b', start: 4, end: 8, path: '', field: 'a}}b' }]);
    // Composed: converting back must reproduce the original stored string exactly.
    expect(toStoredForm(text, refs)).toBe(stored);
  });

  it('does not treat a tag missing "field" as a reference, and leaves it as literal text', () => {
    // The backend throws "{{ref}} requires a field" for this input, so a tag lacking field should
    // never reach here through the normal save path — but the reader must fail the same way as any
    // other unrecognized shape (unmatched, passed through literally), never by inventing an
    // empty-string field and silently resolving a reference to nothing.
    const stored = 'SUM({{ref path="x"}})';
    const { text, refs } = toAuthoringForm(stored, () => {
      throw new Error('nameOf should never be called for a tag without a field');
    });
    expect(text).toBe(stored);
    expect(refs).toEqual([]);
  });

  it('leaves a non-canonical tag as literal text — the backend guarantees this reader never sees one', () => {
    // Attribute order, spacing and unknown keys are all things a real Handlebars parse tolerates
    // but this reader deliberately does not: CalculatedFieldValidatorService rewrites every
    // reference into exactly this canonical shape before a formula is ever persisted (see
    // apps/backend/src/data-marts/calculated-fields/calculated-field-validator.service.ts), so the
    // reader can stay this simple. Swapped order shown here as the representative case.
    const stored = 'SUM({{ref field="spend" path="costs"}})';
    const { text, refs } = toAuthoringForm(stored, () => {
      throw new Error('nameOf should never be called for a non-canonical tag');
    });
    expect(text).toBe(stored);
    expect(refs).toEqual([]);
  });
});
