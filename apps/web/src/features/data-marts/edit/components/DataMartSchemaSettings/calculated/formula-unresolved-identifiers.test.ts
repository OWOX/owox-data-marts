import { describe, it, expect } from 'vitest';
import { resolveAll } from './formula-resolution';
import type { ReferenceableField } from './formula-reference-index';
import { aggregateFunctionsFor } from './formula-function-dialects';
import {
  describeUnresolvedIdentifiers,
  findUnresolvedIdentifiers,
} from './formula-unresolved-identifiers';

function field(overrides: Partial<ReferenceableField> = {}): ReferenceableField {
  return { name: 'f', path: '', field: 'f', type: 'STRING', isHidden: false, ...overrides };
}

const index = [
  field({ name: 'cost', field: 'cost', type: 'FLOAT' }),
  field({ name: 'clicks', field: 'clicks', type: 'INTEGER' }),
  field({ name: 'impressions', field: 'impressions', type: 'INTEGER' }),
  field({ name: 'status', field: 'status' }),
];

const BIGQUERY_FUNCTIONS = aggregateFunctionsFor('GOOGLE_BIGQUERY');

/** Exactly what the dialog does: resolve first, then look for what did not resolve. */
function unresolvedIn(text: string) {
  return findUnresolvedIdentifiers(text, resolveAll(text, index), {
    functionNames: BIGQUERY_FUNCTIONS,
  });
}

const namesIn = (text: string) => unresolvedIn(text).map(id => id.name);

describe('findUnresolvedIdentifiers', () => {
  it('reports the joined field the product owner typed, as one qualified name', () => {
    // The reported bug: this reached the backend with `orders.amount` as literal SQL, so the
    // backend saw SUM() with no reference inside and answered "SUM references no field".
    const text = 'Sum(cost) * 2 * SUM(orders.amount)';
    expect(unresolvedIn(text)).toEqual([
      {
        name: 'orders.amount',
        start: text.indexOf('orders'),
        end: text.length - 1,
        qualified: true,
      },
    ]);
  });

  it('reports a typo', () => {
    expect(namesIn('SUM(clickz)')).toEqual(['clickz']);
  });

  it('reports nothing for a formula whose every name resolves', () => {
    expect(unresolvedIn('SUM(clicks) / NULLIF(SUM(impressions), 0)')).toEqual([]);
  });

  it('does not report a dialect aggregate used bare, without a call', () => {
    expect(namesIn('COUNT')).toEqual([]);
    expect(namesIn('any_value')).toEqual([]);
  });

  it('does not report a dialect aggregate whatever its casing', () => {
    expect(namesIn('sum(clicks) + Approx_Count_Distinct(clicks)')).toEqual([]);
  });

  it('does not report a scalar function the dialect list has never heard of', () => {
    // The list holds AGGREGATES only; every other call is recognised by the `(` that follows it.
    expect(namesIn('ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)), 2)')).toEqual([]);
  });

  it('does not report a name inside a string literal', () => {
    expect(namesIn(`COUNTIF(status = 'orders.amount')`)).toEqual([]);
  });

  it('does not report a name inside a comment', () => {
    expect(namesIn('SUM(clicks) -- todo: switch to orders.amount')).toEqual([]);
    expect(namesIn('SUM(clicks) /* was revenuz */')).toEqual([]);
  });

  it('does not report a double-quoted value, which is a string literal on BigQuery', () => {
    expect(namesIn('COUNTIF(status = "active")')).toEqual([]);
  });

  it('does not report SQL keywords, type names or date parts', () => {
    expect(namesIn('SUM(CASE WHEN status IS NOT NULL THEN clicks ELSE 0 END)')).toEqual([]);
    expect(namesIn('CAST(SUM(clicks) AS FLOAT64)')).toEqual([]);
    expect(namesIn('COUNT(DISTINCT clicks)')).toEqual([]);
    expect(namesIn('STRING_AGG(status ORDER BY clicks DESC)')).toEqual([]);
  });

  // Each of these is legal SQL the save-blocker used to refuse, naming the prose in the comment or
  // the keyword in the clause as a field the analyst had misspelled.
  it('does not report the words of a trailing line comment', () => {
    expect(namesIn('SUM(clicks) -- total clicks per day')).toEqual([]);
  });

  it('does not report a function name separated from its parenthesis by a comment', () => {
    // The backend strips comments before pairing a name with its `(`, so this IS a call there.
    expect(namesIn('NULLIF /* portable guard */ (SUM(clicks), 0)')).toEqual([]);
  });

  it('does not report the keywords of an AT TIME ZONE clause', () => {
    expect(namesIn(`MAX(clicks AT TIME ZONE 'UTC')`)).toEqual([]);
  });

  it('does not report the NULLS FIRST / NULLS LAST ordering keywords', () => {
    expect(namesIn('STRING_AGG(status ORDER BY clicks NULLS FIRST)')).toEqual([]);
    expect(namesIn('STRING_AGG(status ORDER BY clicks NULLS LAST)')).toEqual([]);
  });

  it('reports each distinct name once, in the order it appears', () => {
    expect(namesIn('SUM(orders.amount) + SUM(orders.amount) + SUM(clickz)')).toEqual([
      'orders.amount',
      'clickz',
    ]);
  });

  it('does not report a reference the editor carried forward for a field gone from the schema', () => {
    // Reopening a saved metric whose field went DISCONNECTED: `gone` has no index entry but IS a
    // resolved reference, and the backend names it precisely (FORMULA_UNKNOWN_REFERENCE).
    const text = 'SUM(clicks) + gone';
    const carried = { text: 'gone', start: 14, end: 18, path: '', field: 'gone' };
    const refs = [...resolveAll(text, index), carried];
    expect(findUnresolvedIdentifiers(text, refs, { functionNames: BIGQUERY_FUNCTIONS })).toEqual(
      []
    );
  });

  it('does not report a field whose own name is dotted', () => {
    const dotted = [field({ name: 'payload.value', field: 'payload.value' })];
    const text = 'SUM(payload.value)';
    expect(findUnresolvedIdentifiers(text, resolveAll(text, dotted), {})).toEqual([]);
  });

  it('reports a dotted name whose prefix is a real field but whose leaf is not', () => {
    const dotted = [field({ name: 'payload', field: 'payload' })];
    const text = 'SUM(payload.missing)';
    expect(
      findUnresolvedIdentifiers(text, resolveAll(text, dotted), {}).map(id => id.name)
    ).toEqual(['payload.missing']);
  });

  it('marks a dotted name as qualified and a bare one as not', () => {
    expect(unresolvedIn('SUM(orders.amount)').map(id => id.qualified)).toEqual([true]);
    expect(unresolvedIn('SUM(clickz)').map(id => id.qualified)).toEqual([false]);
  });
});

describe('describeUnresolvedIdentifiers', () => {
  it('returns null when nothing is unresolved', () => {
    expect(describeUnresolvedIdentifiers([])).toBeNull();
  });

  it('names the identifier in the generic message', () => {
    const message = describeUnresolvedIdentifiers(unresolvedIn('SUM(orders.amount)'));
    expect(message).toContain('`orders.amount`');
    expect(message).toContain('not a field of this Data Mart');
  });

  it('tells the analyst what to check when an unresolved name is qualified', () => {
    const message = describeUnresolvedIdentifiers(unresolvedIn('SUM(orders.amount)'));
    expect(message).toContain(
      'A joined Data Mart field is written as `join alias`.`field` — check that the alias still names a joined Data Mart and that the field is not hidden there.'
    );
  });

  it('no longer claims joined references are unsupported — they are offered now', () => {
    const message = describeUnresolvedIdentifiers(unresolvedIn('SUM(orders.amount)'));
    expect(message).not.toContain('not yet supported');
  });

  it('leaves the joined note off a plain typo, which has nothing to do with joins', () => {
    const message = describeUnresolvedIdentifiers(unresolvedIn('SUM(clickz)'));
    expect(message).not.toContain('joined Data Mart');
  });

  it('adds the joined note once, however many qualified names there are', () => {
    const message = describeUnresolvedIdentifiers(
      unresolvedIn('SUM(orders.amount) + SUM(items.qty)')
    );
    expect(message?.match(/A joined Data Mart field is written as/g)).toHaveLength(1);
  });

  it('does not claim a dotted name is not a field when the join tree could not be loaded', () => {
    const message = describeUnresolvedIdentifiers(
      unresolvedIn('SUM(orders.amount)'),
      'unavailable'
    );
    expect(message).toContain('`orders.amount` could not be checked against the joined Data Marts');
    expect(message).toContain('reload the page');
    expect(message).not.toContain('is not a field of this Data Mart');
    expect(message).not.toContain('check that the alias');
  });

  it('says the join tree is still loading rather than that loading it failed', () => {
    const message = describeUnresolvedIdentifiers(unresolvedIn('SUM(orders.amount)'), 'loading');
    expect(message).toContain('still loading');
    expect(message).not.toContain('failed');
  });

  it('still blames an UNQUALIFIED name on the analyst when the join tree is unknown', () => {
    // No join tree can explain `clickz`: it names no source, so the ordinary message stays right.
    const message = describeUnresolvedIdentifiers(unresolvedIn('SUM(clickz)'), 'unavailable');
    expect(message).toContain('`clickz` is not a field of this Data Mart');
    expect(message).not.toContain('joined Data Marts');
  });

  it('reports nothing at all for a joined name the index resolved', () => {
    // The guard must not start refusing the very references this feature added: a resolved joined
    // reference is a reference, not an unresolved name.
    const withJoined = [
      ...index,
      { name: 'orders.amount', path: 'orders', field: 'amount', type: 'FLOAT', isHidden: false },
    ];
    const text = 'SUM(cost) * 2 * SUM(orders.amount)';
    expect(
      findUnresolvedIdentifiers(text, resolveAll(text, withJoined), {
        functionNames: BIGQUERY_FUNCTIONS,
      })
    ).toEqual([]);
  });

  it('names every unresolved identifier, not just the first', () => {
    const message = describeUnresolvedIdentifiers(unresolvedIn('SUM(clickz) + SUM(impressionz)'));
    expect(message).toContain('`clickz`');
    expect(message).toContain('`impressionz`');
  });
});
