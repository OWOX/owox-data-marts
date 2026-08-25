import { describe, it, expect } from 'vitest';
import { resolveAll } from './formula-resolution';
import type { ReferenceableField } from './formula-reference-index';

function field(overrides: Partial<ReferenceableField> = {}): ReferenceableField {
  return { name: 'f', path: '', field: 'f', type: 'STRING', isHidden: false, ...overrides };
}

describe('resolveAll', () => {
  it('resolves a field literally named "sum" without the SUM() call around it', () => {
    const refs = resolveAll('SUM(sum) + 1', [field({ name: 'sum', field: 'sum' })]);
    expect(refs).toEqual([{ text: 'sum', start: 4, end: 7, path: '', field: 'sum' }]);
  });

  it('resolves a field literally named "sum" even when the call around it is also lowercase', () => {
    // Case-sensitivity alone cannot tell "sum" the field from "sum" the function when both are
    // spelled the same way — SQL keywords are case-insensitive, so the function's own casing
    // proves nothing. Only "is this immediately followed by (" tells them apart.
    const text = 'sum(sum)';
    const refs = resolveAll(text, [field({ name: 'sum', field: 'sum' })]);
    const start = text.lastIndexOf('sum');
    expect(refs).toEqual([{ text: 'sum', start, end: start + 3, path: '', field: 'sum' }]);
  });

  it('resolves a field literally named "count" without the COUNT() call around it', () => {
    const refs = resolveAll('COUNT(count)', [field({ name: 'count', field: 'count' })]);
    expect(refs).toEqual([{ text: 'count', start: 6, end: 11, path: '', field: 'count' }]);
  });

  it('does not resolve a field name immediately followed by "(" — a nested call, not a column', () => {
    // A field named the same as a nested function call (here "abs") must not resolve just
    // because its spelling matches; only "clicks" is a real column reference in SUM(abs(clicks)).
    const text = 'SUM(abs(clicks))';
    const fields = [
      field({ name: 'abs', field: 'abs' }),
      field({ name: 'clicks', field: 'clicks' }),
    ];
    const refs = resolveAll(text, fields);
    const clicksStart = text.indexOf('clicks');
    expect(refs).toEqual([
      { text: 'clicks', start: clicksStart, end: clicksStart + 6, path: '', field: 'clicks' },
    ]);
  });

  it('resolves both a name and a longer name that has it as a prefix', () => {
    const fields = [
      field({ name: 'rev', field: 'rev' }),
      field({ name: 'revenue', field: 'revenue' }),
    ];
    const refs = resolveAll('rev + revenue', fields);
    expect(refs).toEqual([
      { text: 'rev', start: 0, end: 3, path: '', field: 'rev' },
      { text: 'revenue', start: 6, end: 13, path: '', field: 'revenue' },
    ]);
  });

  it('does not resolve a field name that only appears inside a string literal', () => {
    const refs = resolveAll("'clicks' || clicks", [field({ name: 'clicks', field: 'clicks' })]);
    expect(refs).toEqual([{ text: 'clicks', start: 12, end: 18, path: '', field: 'clicks' }]);
  });

  it('resolves a field name inside a quoted identifier — it names a real column there', () => {
    // "…" is a quoted IDENTIFIER on Athena, Snowflake, Redshift and Databricks (5 of the 6
    // storages this app supports), not a string literal. SUM("order") really does reference the
    // column "order"; treating the quotes as string-literal delimiters would wrongly drop it,
    // leaving SUM with zero live references and rejecting a save that is actually correct.
    const text = 'SUM("order")';
    const refs = resolveAll(text, [field({ name: 'order', field: 'order' })]);
    expect(refs).toEqual([{ text: 'order', start: 5, end: 10, path: '', field: 'order' }]);
  });

  it('does not resolve a field name that only appears inside a line comment', () => {
    const text = '-- SUM(clicks)\nSUM(clicks)';
    const refs = resolveAll(text, [field({ name: 'clicks', field: 'clicks' })]);
    const start = text.lastIndexOf('clicks');
    expect(refs).toEqual([{ text: 'clicks', start, end: start + 6, path: '', field: 'clicks' }]);
  });

  it('does not resolve a field name that only appears inside a block comment', () => {
    const text = '/* SUM(clicks) */ SUM(clicks)';
    const refs = resolveAll(text, [field({ name: 'clicks', field: 'clicks' })]);
    const start = text.lastIndexOf('clicks');
    expect(refs).toEqual([{ text: 'clicks', start, end: start + 6, path: '', field: 'clicks' }]);
  });

  it('does not let an apostrophe inside a comment pair up with a later string and swallow a field', () => {
    // Delimiter-matching a bare `'` would pair the apostrophe in "don't" with the opening quote
    // of 'paid' on the next line, treating "channel = " as string contents and silently dropping
    // `channel`. The real lexer recognizes the `--` comment first, so that apostrophe is consumed
    // as ordinary comment text and never reaches quote-matching at all.
    const text = "-- don't count organic\nSUM(IF(channel = 'paid', clicks, 0))";
    const fields = [
      field({ name: 'channel', field: 'channel' }),
      field({ name: 'clicks', field: 'clicks' }),
    ];
    const refs = resolveAll(text, fields);
    const channelStart = text.indexOf('channel');
    const clicksStart = text.indexOf('clicks', channelStart);
    expect(refs).toEqual([
      { text: 'channel', start: channelStart, end: channelStart + 7, path: '', field: 'channel' },
      { text: 'clicks', start: clicksStart, end: clicksStart + 6, path: '', field: 'clicks' },
    ]);
  });

  it('drops a name that resolves ambiguously instead of picking a candidate', () => {
    const fields = [
      field({ name: 'payload.value', field: 'payload.value' }),
      field({ name: 'payload.value', field: 'payload.value' }),
    ];
    expect(resolveAll('payload.value', fields)).toEqual([]);
  });

  it('prefers the longer dotted path over its bare prefix', () => {
    const fields = [
      field({ name: 'payload', field: 'payload' }),
      field({ name: 'payload.value', field: 'payload.value' }),
    ];
    expect(resolveAll('payload.value + payload', fields)).toEqual([
      { text: 'payload.value', start: 0, end: 13, path: '', field: 'payload.value' },
      { text: 'payload', start: 16, end: 23, path: '', field: 'payload' },
    ]);
  });

  it('passes text with no matching field through with no references', () => {
    expect(resolveAll('1 + 1', [field({ name: 'clicks', field: 'clicks' })])).toEqual([]);
  });
});

describe('resolveAll — carrying forward a reference whose field went missing', () => {
  it('keeps a previous reference when its span is untouched and the field is gone from the index', () => {
    // e.g. the field went DISCONNECTED between renders. Dropping the reference here would turn a
    // save-time error the backend can name ("field clicks is missing") into a bare, unrecognized
    // word — deferring the failure to warehouse run time instead.
    const text = 'SUM(clicks) + 1';
    const previousRefs = [{ text: 'clicks', start: 4, end: 10, path: '', field: 'clicks' }];
    const refs = resolveAll(
      text,
      [field({ name: 'impressions', field: 'impressions' })],
      previousRefs
    );
    expect(refs).toEqual([{ text: 'clicks', start: 4, end: 10, path: '', field: 'clicks' }]);
  });

  it('still drops the previous reference once its own span is edited, even with an index miss', () => {
    const text = 'SUM(clcks) + 1';
    const previousRefs = [{ text: 'clicks', start: 4, end: 10, path: '', field: 'clicks' }];
    const refs = resolveAll(
      text,
      [field({ name: 'impressions', field: 'impressions' })],
      previousRefs
    );
    expect(refs).toEqual([]);
  });

  it('does not carry a previous reference forward once its name resolves again, even ambiguously', () => {
    // Becoming ambiguous is a different, new problem — two fields now share the name — not the
    // same field having gone missing, so the carry-forward rule does not apply to it.
    const text = 'payload.value';
    const previousRefs = [
      { text: 'payload.value', start: 0, end: 13, path: '', field: 'payload.value' },
    ];
    const fields = [
      field({ name: 'payload.value', field: 'payload.value' }),
      field({ name: 'payload.value', field: 'payload.value' }),
    ];
    expect(resolveAll(text, fields, previousRefs)).toEqual([]);
  });
});
