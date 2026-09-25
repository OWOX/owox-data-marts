import assert from 'node:assert';
import { describe, it } from 'node:test';
import { FieldCaster } from '../../src/Core/Declarative/FieldCaster.js';

describe('FieldCaster', () => {
  const fields = {
    date: { apiName: 'date', type: 'date' },
    impressions: { apiName: 'metric.impressions', type: 'number' },
    name: { apiName: 'name', type: 'string' },
    active: { apiName: 'active', type: 'boolean' },
  };
  const caster = new FieldCaster(fields);

  it('extracts nested apiName values and casts by type', () => {
    const out = caster.cast([
      { date: '2026-01-01', metric: { impressions: '42' }, name: 7, active: 'true' },
    ]);
    assert.strictEqual(out[0].impressions, 42);
    assert.strictEqual(out[0].name, '7');
    assert.strictEqual(out[0].active, true);
    assert.ok(out[0].date instanceof Date);
    assert.strictEqual(out[0].date.toISOString().slice(0, 10), '2026-01-01');
  });

  it('keeps missing values as null', () => {
    const out = caster.cast([{ date: '2026-01-01', name: 'x' }]);
    assert.strictEqual(out[0].impressions, null);
  });

  it('does not coerce empty/undefined numbers into NaN', () => {
    const out = caster.cast([{ metric: { impressions: '' } }]);
    assert.strictEqual(out[0].impressions, null);
  });

  it('extracts via dataPath and prefers it over apiName', () => {
    const c = new FieldCaster({
      Japan: { dataPath: 'releaseDates.Japan', type: 'string' },
      legacy: { dataPath: 'a.b', apiName: 'ignored', type: 'string' },
    });
    const out = c.cast([{ releaseDates: { Japan: 'Jan 24, 2019' }, a: { b: 'x' } }]);
    assert.strictEqual(out[0].Japan, 'Jan 24, 2019');
    assert.strictEqual(out[0].legacy, 'x');
  });

  it('returns null when a dataPath is missing at any depth', () => {
    const c = new FieldCaster({ jp: { dataPath: 'releaseDates.Japan', type: 'string' } });
    assert.strictEqual(c.cast([{ releaseDates: {} }])[0].jp, null);
    assert.strictEqual(c.cast([{}])[0].jp, null);
    assert.strictEqual(c.cast([{ releaseDates: null }])[0].jp, null);
  });

  it('JSON-stringifies object and array values instead of [object Object]', () => {
    const c = new FieldCaster({
      genre: { type: 'object' },
      releaseDates: { type: 'object' },
      tags: { type: 'string' },
    });
    const out = c.cast([
      { genre: ['Survival', 'shooter'], releaseDates: { Japan: 'x' }, tags: ['a', 'b'] },
    ]);
    assert.strictEqual(out[0].genre, '["Survival","shooter"]');
    assert.strictEqual(out[0].releaseDates, '{"Japan":"x"}');
    assert.strictEqual(out[0].tags, '["a","b"]');
  });
});

describe('FieldCaster booleans and datetimes', () => {
  const castOne = (type, value) => new FieldCaster({ v: { type } }).cast([{ v: value }])[0].v;

  // APIs spell booleans many ways; anything but "true" used to read as false.
  it('reads the usual spellings of true and false, and nothing else as either', () => {
    for (const value of ['true', 'TRUE', '1', 'yes', 'Y', 't', 'on']) {
      assert.strictEqual(castOne('boolean', value), true, value);
    }
    for (const value of ['false', '0', 'no', 'N', 'f', 'off']) {
      assert.strictEqual(castOne('boolean', value), false, value);
    }
    assert.strictEqual(castOne('boolean', 'maybe'), null);
    assert.strictEqual(castOne('boolean', 1), true);
  });

  // A datetime stayed text, and BigQuery refuses a DATETIME literal such as
  // "2024-01-15 10:00:00Z", which is what an ISO string with a zone became.
  it('casts a datetime to a Date, reading a zone-less one as UTC', () => {
    assert.strictEqual(
      castOne('datetime', '2024-01-15T10:00:00Z').toISOString(),
      '2024-01-15T10:00:00.000Z'
    );
    assert.strictEqual(
      castOne('datetime', '2024-01-15T12:00:00+02:00').toISOString(),
      '2024-01-15T10:00:00.000Z'
    );
    assert.strictEqual(
      castOne('datetime', '2024-01-15 10:00:00').toISOString(),
      '2024-01-15T10:00:00.000Z'
    );
    assert.strictEqual(castOne('datetime', 'not a date'), null);
  });
});
