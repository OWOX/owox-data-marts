import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SubstreamRetriever } from '../../src/Core/Declarative/SubstreamRetriever.js';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';

const partitionRouter = {
  type: 'substream',
  parent: { request: { method: 'GET', path: '/campaigns' }, recordPath: ['data'], key: 'id' },
  partitionField: 'campaign_id',
};
const childRequestSpec = { method: 'GET', path: '/campaigns/x/stats' };
const childRecordSelector = new RecordSelector({ recordPath: ['stats'] });

describe('SubstreamRetriever', () => {
  it('runs the child once per distinct non-null parent key and concatenates', async () => {
    const calls = [];
    const requester = {
      async send(requestSpec, scope) {
        calls.push({
          path: requestSpec.path,
          slice: scope.stream_slice ? { ...scope.stream_slice } : null,
        });
        if (requestSpec.path === '/campaigns')
          return { data: [{ id: 'A' }, { id: 'B' }, { id: 'B' }, { id: null }] };
        return { stats: [{ who: scope.stream_slice.campaign_id }] };
      },
    };
    const r = new SubstreamRetriever({
      requester,
      partitionRouter,
      childRequestSpec,
      childRecordSelector,
    });
    const out = await r.run({ parameters: {} });
    assert.deepStrictEqual(out, [{ who: 'A' }, { who: 'B' }]);
    assert.strictEqual(calls.filter(c => c.path === '/campaigns').length, 1);
    const childCalls = calls.filter(c => c.path !== '/campaigns');
    assert.deepStrictEqual(
      childCalls.map(c => c.slice.campaign_id),
      ['A', 'B']
    );
  });

  it('returns [] when the parent produces no records', async () => {
    const requester = {
      async send(req) {
        return req.path === '/campaigns' ? { data: [] } : { stats: [{}] };
      },
    };
    const r = new SubstreamRetriever({
      requester,
      partitionRouter,
      childRequestSpec,
      childRecordSelector,
    });
    assert.deepStrictEqual(await r.run({}), []);
  });

  it('caps the number of slices at maxSlices', async () => {
    const calls = [];
    const requester = {
      async send(req) {
        calls.push(req.path === '/campaigns' ? 'parent' : 'child');
        return req.path === '/campaigns'
          ? { data: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] }
          : { stats: [{}] };
      },
    };
    const r = new SubstreamRetriever({
      requester,
      partitionRouter,
      childRequestSpec,
      childRecordSelector,
      maxSlices: 2,
    });
    const out = await r.run({});
    assert.strictEqual(out.length, 2);
    assert.strictEqual(calls.filter(c => c === 'child').length, 2);
  });

  it('caps total records at maxRows across slices', async () => {
    const requester = {
      async send(req) {
        return req.path === '/campaigns'
          ? { data: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] }
          : { stats: [{}, {}] };
      },
    };
    const r = new SubstreamRetriever({
      requester,
      partitionRouter,
      childRequestSpec,
      childRecordSelector,
      maxRows: 3,
    });
    const out = await r.run({});
    assert.strictEqual(out.length, 3);
  });

  it('does not mutate the caller scope (no leaked stream_slice)', async () => {
    const requester = {
      async send(req, scope) {
        return req.path === '/campaigns'
          ? { data: [{ id: 'A' }] }
          : { stats: [{ who: scope.stream_slice.campaign_id }] };
      },
    };
    const scope = { parameters: {} };
    await new SubstreamRetriever({
      requester,
      partitionRouter,
      childRequestSpec,
      childRecordSelector,
    }).run(scope);
    assert.strictEqual(scope.stream_slice, undefined);
    assert.deepStrictEqual(scope, { parameters: {} });
  });

  describe('per-slice mode', () => {
    const make = (calls, extra = {}) =>
      new SubstreamRetriever({
        requester: {
          async send(spec, scope) {
            if (spec.path === '/campaigns')
              return { data: [{ id: 'A' }, { id: 'B' }, { id: 'B' }, { id: 'C' }, { id: null }] };
            calls.push(scope.stream_slice.campaign_id);
            // fresh rows per call: a shared body would alias records across slices
            return {
              stats: [
                { who: scope.stream_slice.campaign_id },
                { who: scope.stream_slice.campaign_id },
              ],
            };
          },
        },
        partitionRouter,
        childRequestSpec,
        childRecordSelector,
        ...extra,
      });

    it('hands each slice to onSlice in order and returns []', async () => {
      const got = [];
      const out = await make([]).run(
        { parameters: {} },
        { onSlice: async (records, i) => got.push([i, records.map(r => r.who)]) }
      );
      assert.deepStrictEqual(out, []);
      assert.deepStrictEqual(got, [
        [0, ['A', 'A']],
        [1, ['B', 'B']],
        [2, ['C', 'C']],
      ]);
    });

    it('passes deduped values to onSliceList and skips slices before startAt', async () => {
      const calls = [];
      let listed;
      const got = [];
      await make(calls).run(
        { parameters: {} },
        {
          onSliceList: v => ((listed = v), 2),
          onSlice: async (_r, i) => got.push(i),
        }
      );
      assert.deepStrictEqual(listed, ['A', 'B', 'C']);
      assert.deepStrictEqual(calls, ['C']);
      assert.deepStrictEqual(got, [2]);
    });

    it('stops between slices at maxRows', async () => {
      const got = [];
      await make([], { maxRows: 3 }).run(
        { parameters: {} },
        { onSlice: async (_r, i) => got.push(i) }
      );
      assert.deepStrictEqual(got, [0, 1]);
    });

    it('stops on an onSlice rejection and rethrows it', async () => {
      const calls = [];
      await assert.rejects(
        make(calls).run(
          { parameters: {} },
          {
            onSlice: async (_r, i) => {
              if (i === 1) throw new Error('boom');
            },
          }
        ),
        /boom/
      );
      assert.deepStrictEqual(calls, ['A', 'B']);
    });

    it('is unchanged without options', async () => {
      const out = await make([]).run({ parameters: {} });
      assert.strictEqual(out.length, 6);
    });
  });
});
