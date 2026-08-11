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
