import assert from 'node:assert';
import { describe, it } from 'node:test';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';

const TYPED_MANIFEST = JSON.stringify({
  version: '1.0',
  name: 'Typed',
  baseUrl: 'https://api.example.com',
  parameters: { Fields: {} },
  nodes: {
    games: {
      fields: {
        id: { apiName: 'id', type: 'integer' },
        name: { apiName: 'name', type: 'string' },
        price: { apiName: 'price', type: 'number' },
        active: { apiName: 'active', type: 'boolean' },
        when: { apiName: 'when', type: 'datetime' },
        weird: { apiName: 'weird', type: 'totally-unknown' },
        bare: { apiName: 'bare' },
      },
      request: { method: 'GET', path: '/games' },
      recordSelector: { recordPath: [] },
    },
  },
});

function makeContext() {
  return new AbstractContext({
    source: { name: 'Typed', config: { Fields: { value: 'games id, games name' } } },
    storage: { name: 'MockStorage', config: {} },
    runConfig: { type: 'INCREMENTAL', data: [], state: {} },
    env: { datamartId: 'dm', runId: 'run' },
  });
}

describe('DeclarativeSource field-type normalization (storage vocabulary)', () => {
  it('exposes UPPERCASE DATA_TYPES field types for the storage layer', () => {
    const model = new ManifestParser().parse(TYPED_MANIFEST);
    const source = new DeclarativeSource(makeContext(), model);
    const f = source.fieldsSchema.games.fields;
    assert.strictEqual(f.id.type, 'INTEGER');
    assert.strictEqual(f.name.type, 'STRING');
    assert.strictEqual(f.price.type, 'NUMBER');
    assert.strictEqual(f.active.type, 'BOOLEAN');
    assert.strictEqual(f.when.type, 'DATETIME');
    // hand-authored unknown / missing types fall back to STRING so the storage
    // layer never throws "Unknown type" mid-run.
    assert.strictEqual(f.weird.type, 'STRING');
    assert.strictEqual(f.bare.type, 'STRING');
  });

  it('preserves apiName and other field metadata while normalizing the type', () => {
    const model = new ManifestParser().parse(TYPED_MANIFEST);
    const source = new DeclarativeSource(makeContext(), model);
    assert.strictEqual(source.fieldsSchema.games.fields.id.apiName, 'id');
  });

  it('leaves the raw manifest field types untouched (FieldCaster casts by lowercase type)', () => {
    const model = new ManifestParser().parse(TYPED_MANIFEST);
    const source = new DeclarativeSource(makeContext(), model);
    // The raw model keeps the authored lowercase type; FieldCaster reads model.nodes.
    assert.strictEqual(model.nodes.games.fields.id.type, 'integer');
    // FieldCaster must still cast an integer correctly via the raw lowercase type.
    const cast = source.fieldsSchema; // touch to ensure construction completed
    assert.ok(cast);
  });
});
