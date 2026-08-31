import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AccountResolver } from '../../src/Core/Declarative/AccountResolver.js';

describe('AccountResolver', () => {
  it('returns [null] when manifest declares no accounts', () => {
    const r = new AccountResolver(null, () => '123');
    assert.deepStrictEqual(r.resolve(), [null]);
  });

  // Regression guard for the legitimate "this connector has no account concept"
  // path: with NO accounts block the resolved string is irrelevant and one
  // null-account pass is correct. Only the declared-accounts case below changed.
  it('returns [null] with no accounts block even when the resolved value is blank', () => {
    const r = new AccountResolver(null, () => '');
    assert.deepStrictEqual(r.resolve(), [null]);
  });

  it('splits + trims a comma/semicolon list into {id} objects', () => {
    const r = new AccountResolver(
      { from: '{{ parameters.AccountIDs }}', parse: { split: '[,;]', trim: true } },
      () => '12, 34 ;56'
    );
    assert.deepStrictEqual(r.resolve(), [{ id: '12' }, { id: '34' }, { id: '56' }]);
  });

  it('strips characters and applies a prefix', () => {
    const r = new AccountResolver(
      {
        from: '{{ parameters.CustomerId }}',
        parse: { split: '[,;]', trim: true, strip: '-', prefix: 'urn:li:x:' },
      },
      () => '123-456-7890'
    );
    assert.deepStrictEqual(r.resolve(), [{ id: 'urn:li:x:1234567890' }]);
  });
});

// A source that DECLARES accounts and resolves none of them is a configuration
// error, and AbstractConnector._resolveAccounts already fails the run for it --
// but only ever sees []. Returning [null] for a blank value short-circuited that
// guard before the split ran, so `AccountIDs = ","` failed loudly while
// `AccountIDs = ""` proceeded with a single null account. '' is the COMMON case:
// a config form submits an untouched optional field as '' (see the comment in
// Requester._renderOptionalMap). Downstream, `{{ account.id }}` in
// queryParameters is silently DROPPED by _renderOptionalMap, so the request goes
// out with no account filter, the API answers with its default scope, rows are
// written, and the run reports COMPLETED.
describe('AccountResolver blank value with a declared accounts block', () => {
  const declared = extra => ({ from: '{{ parameters.AccountIDs }}', ...extra });

  it('returns [] for an empty string', () => {
    const r = new AccountResolver(declared(), () => '');
    assert.deepStrictEqual(r.resolve(), []);
  });

  it('returns [] for a whitespace-only value', () => {
    const r = new AccountResolver(declared(), () => '   ');
    assert.deepStrictEqual(r.resolve(), []);
  });

  it('returns [] for a whitespace-only value even with parse.trim disabled', () => {
    const r = new AccountResolver(declared({ parse: { trim: false } }), () => ' \t ');
    assert.deepStrictEqual(r.resolve(), []);
  });

  it('returns [] for null and undefined', () => {
    assert.deepStrictEqual(new AccountResolver(declared(), () => null).resolve(), []);
    assert.deepStrictEqual(new AccountResolver(declared(), () => undefined).resolve(), []);
  });

  it('still returns [] for a separators-only value (unchanged behaviour)', () => {
    const r = new AccountResolver(declared({ parse: { split: '[,;]', trim: true } }), () => ',');
    assert.deepStrictEqual(r.resolve(), []);
  });

  it('still resolves a real id (the blank guard must not swallow valid input)', () => {
    const r = new AccountResolver(declared({ parse: { split: '[,;]', trim: true } }), () => ' 42 ');
    assert.deepStrictEqual(r.resolve(), [{ id: '42' }]);
  });
});
