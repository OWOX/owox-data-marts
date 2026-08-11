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
});
