import assert from 'node:assert';
import { describe, it } from 'node:test';
import { ListPartitionRetriever } from '../../src/Core/Declarative/ListPartitionRetriever.js';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';

const childRequestSpec = { method: 'GET', path: '/stats/{{ stream_slice.country }}' };
const childRecordSelector = new RecordSelector({ recordPath: ['rows'] });

function mockRequester(calls) {
  return {
    async send(requestSpec, scope) {
      calls.push({ slice: scope.stream_slice ? { ...scope.stream_slice } : null });
      return { rows: [{ who: scope.stream_slice.country }] };
    },
  };
}

describe('ListPartitionRetriever', () => {
  it('runs the child once per literal value with stream_slice set', async () => {
    const calls = [];
    const pr = { type: 'list', values: ['US', 'UK'], partitionField: 'country' };
    const r = new ListPartitionRetriever({
      requester: mockRequester(calls),
      partitionRouter: pr,
      childRequestSpec,
      childRecordSelector,
    });
    const out = await r.run({ parameters: {} });
    assert.deepStrictEqual(out, [{ who: 'US' }, { who: 'UK' }]);
    assert.deepStrictEqual(
      calls.map(c => c.slice.country),
      ['US', 'UK']
    );
  });

  it('resolves values from a comma-string parameter', async () => {
    const calls = [];
    const pr = { type: 'list', valuesFromParameter: 'Countries', partitionField: 'country' };
    const r = new ListPartitionRetriever({
      requester: mockRequester(calls),
      partitionRouter: pr,
      childRequestSpec,
      childRecordSelector,
    });
    const out = await r.run({ parameters: { Countries: 'US, DE' } });
    assert.deepStrictEqual(
      out.map(x => x.who),
      ['US', 'DE']
    );
  });

  it('dedupes values and caps at maxSlices', async () => {
    const calls = [];
    const pr = { type: 'list', values: ['A', 'A', 'B', 'C'], partitionField: 'country' };
    const r = new ListPartitionRetriever({
      requester: mockRequester(calls),
      partitionRouter: pr,
      childRequestSpec,
      childRecordSelector,
      maxSlices: 2,
    });
    const out = await r.run({ parameters: {} });
    assert.deepStrictEqual(
      out.map(x => x.who),
      ['A', 'B']
    );
  });

  it('returns [] for an empty list', async () => {
    const calls = [];
    const pr = { type: 'list', valuesFromParameter: 'Missing', partitionField: 'country' };
    const r = new ListPartitionRetriever({
      requester: mockRequester(calls),
      partitionRouter: pr,
      childRequestSpec,
      childRecordSelector,
    });
    assert.deepStrictEqual(await r.run({ parameters: {} }), []);
    assert.strictEqual(calls.length, 0);
  });
});

// M5, second site: runChildSlices concatenated each slice's records with
// `all.push(...records)`, which blows V8's spread-argument limit (~125k) once a
// single slice returns a bulk page (csv/jsonl decode a whole file into one array).
describe('runChildSlices accumulates large slices without spreading', () => {
  const BULK = 200000;

  function bulkRequester() {
    return {
      async send(requestSpec, scope) {
        const tag = scope.stream_slice.country;
        return { rows: Array.from({ length: BULK }, (_, i) => ({ i, tag })) };
      },
    };
  }

  it('accumulates two bulk slices past the spread-argument limit', async () => {
    const pr = { type: 'list', values: ['US', 'UK'], partitionField: 'country' };
    const r = new ListPartitionRetriever({
      requester: bulkRequester(),
      partitionRouter: pr,
      childRequestSpec,
      childRecordSelector,
    });
    const out = await r.run({ parameters: {} });
    assert.strictEqual(out.length, BULK * 2);
    assert.strictEqual(out[0].tag, 'US');
    assert.strictEqual(out[BULK * 2 - 1].tag, 'UK');
  });

  it('still caps a bulk slice at exactly maxRows', async () => {
    const pr = { type: 'list', values: ['US', 'UK'], partitionField: 'country' };
    const r = new ListPartitionRetriever({
      requester: bulkRequester(),
      partitionRouter: pr,
      childRequestSpec,
      childRecordSelector,
      maxRows: 5,
    });
    const out = await r.run({ parameters: {} });
    assert.strictEqual(out.length, 5);
    assert.ok(
      out.every(x => x.tag === 'US'),
      'the cap must be reached inside the first slice'
    );
  });

  it('caps at exactly maxRows across a slice boundary', async () => {
    const calls = [];
    const pr = { type: 'list', values: ['US', 'UK', 'DE'], partitionField: 'country' };
    const r = new ListPartitionRetriever({
      requester: {
        async send(requestSpec, scope) {
          const tag = scope.stream_slice.country;
          calls.push(tag);
          return {
            rows: [
              { tag, n: 1 },
              { tag, n: 2 },
            ],
          };
        },
      },
      partitionRouter: pr,
      childRequestSpec,
      childRecordSelector,
      maxRows: 3,
    });
    const out = await r.run({ parameters: {} });
    assert.deepStrictEqual(
      out.map(x => `${x.tag}${x.n}`),
      ['US1', 'US2', 'UK1']
    );
    assert.deepStrictEqual(calls, ['US', 'UK']); // the third slice is never requested
  });
});
