import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Transformer } from '../../src/Core/Declarative/Transformer.js';
import { TemplateEngine } from '../../src/Core/Declarative/TemplateEngine.js';

const engine = new TemplateEngine();

describe('Transformer', () => {
  it('returns records unchanged when there are no transformations', () => {
    const recs = [{ a: 1 }];
    const out = new Transformer([], engine).transform(recs, {});
    assert.deepStrictEqual(out, [{ a: 1 }]);
    assert.notStrictEqual(out, recs);
    assert.notStrictEqual(out[0], recs[0]);
  });

  it('add: sets a top-level field from a record template', () => {
    const out = new Transformer(
      [{ type: 'add', field: 'full', value: '{{ record.first }} {{ record.last }}' }],
      engine
    ).transform([{ first: 'Ann', last: 'Lee' }], {});
    assert.strictEqual(out[0].full, 'Ann Lee');
  });

  it('add: a missing record field renders empty (lenient), does not throw', () => {
    const out = new Transformer(
      [{ type: 'add', field: 'full', value: '{{ record.first }} {{ record.last }}' }],
      engine
    ).transform([{ first: 'Ann' }], {});
    assert.strictEqual(out[0].full, 'Ann ');
  });

  it('add: can reference a parameter from the scope', () => {
    const out = new Transformer(
      [{ type: 'add', field: 'src', value: '{{ parameters.Source }}' }],
      engine
    ).transform([{}], { parameters: { Source: 'api' } });
    assert.strictEqual(out[0].src, 'api');
  });

  it('remove: deletes a top-level field; no-op when absent', () => {
    const out = new Transformer([{ type: 'remove', field: 'debug' }], engine).transform(
      [{ id: 1, debug: 'x' }, { id: 2 }],
      {}
    );
    assert.deepStrictEqual(out, [{ id: 1 }, { id: 2 }]);
  });

  it('keysToLower: lowercases top-level keys, last wins on collision', () => {
    const out = new Transformer([{ type: 'keysToLower' }], engine).transform(
      [{ Name: 'a', NAME: 'b', id: 1 }],
      {}
    );
    assert.deepStrictEqual(out[0], { name: 'b', id: 1 });
  });

  it('flatten: recursively flattens nested objects with the default "_" separator', () => {
    const out = new Transformer([{ type: 'flatten' }], engine).transform(
      [{ a: 1, addr: { city: 'NY', geo: { lat: 5 } } }],
      {}
    );
    assert.deepStrictEqual(out[0], { a: 1, addr_city: 'NY', addr_geo_lat: 5 });
  });

  it('flatten: leaves arrays intact and honours a custom separator', () => {
    const out = new Transformer([{ type: 'flatten', separator: '.' }], engine).transform(
      [{ tags: [1, 2], addr: { city: 'NY' } }],
      {}
    );
    assert.deepStrictEqual(out[0], { tags: [1, 2], 'addr.city': 'NY' });
  });

  it('applies transformations in array order (flatten then add references a flattened key)', () => {
    const out = new Transformer(
      [
        { type: 'flatten' },
        { type: 'add', field: 'city_label', value: 'City: {{ record.addr_city }}' },
      ],
      engine
    ).transform([{ addr: { city: 'NY' } }], {});
    assert.strictEqual(out[0].city_label, 'City: NY');
  });

  it('does not mutate the input records (deep copy)', () => {
    const recs = [{ a: { b: 1 } }];
    new Transformer([{ type: 'add', field: 'x', value: 'y' }], engine).transform(recs, {});
    assert.deepStrictEqual(recs, [{ a: { b: 1 } }]);
  });

  it("no transformation mutates the caller's record, at any depth", () => {
    // The shallow copy in transform() is only sound because every transform
    // writes at the TOP LEVEL. Run all four against a record with nested state
    // and assert the input is byte-identical afterwards.
    const original = () => ({ Keep: 'k', drop: 'd', addr: { city: 'NY' }, tags: [1, 2] });
    for (const t of [
      { type: 'add', field: 'x', value: 'v' },
      { type: 'remove', field: 'drop' },
      { type: 'keysToLower' },
      { type: 'flatten' },
    ]) {
      const recs = [original()];
      const out = new Transformer([t], engine).transform(recs, {});
      assert.deepStrictEqual(recs, [original()], `input mutated by ${t.type}`);
      assert.notStrictEqual(out[0], recs[0], `${t.type} returned the input object`);
    }
  });

  it('leaves nested values shared by reference (no deep clone) but never writes through', () => {
    const nested = { city: 'NY' };
    const recs = [{ addr: nested }];
    const out = new Transformer([{ type: 'add', field: 'x', value: 'v' }], engine).transform(
      recs,
      {}
    );
    assert.strictEqual(out[0].addr, nested); // shared, deliberately
    assert.strictEqual(recs[0].addr.city, 'NY'); // and untouched
  });

  it('throws on an unknown transformation type', () => {
    assert.throws(
      () => new Transformer([{ type: 'magic' }], engine).transform([{}], {}),
      /unknown transformation type "magic"/
    );
  });
});
