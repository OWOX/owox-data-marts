import assert from 'node:assert';
import { describe, it } from 'node:test';
import { RetrieverFactory } from '../../src/Core/Declarative/RetrieverFactory.js';
import { SyncRetriever } from '../../src/Core/Declarative/SyncRetriever.js';
import { AsyncRetriever } from '../../src/Core/Declarative/AsyncRetriever.js';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';

describe('RetrieverFactory', () => {
  const deps = {
    requester: {
      async send() {
        return {};
      },
    },
    httpClient: {
      async urlFetchWithRetry() {
        return {
          async json() {
            return {};
          },
        };
      },
    },
    ssrfGuard: new SsrfGuard([]),
  };

  it('builds a SyncRetriever for a node without retriever.type (default sync)', () => {
    const node = { request: { method: 'GET', path: '/x' }, recordSelector: { recordPath: [] } };
    const r = RetrieverFactory.build(node, deps);
    assert.ok(r instanceof SyncRetriever);
  });

  it('builds an AsyncRetriever for retriever.type async', () => {
    const node = {
      recordSelector: { recordPath: ['rows'] },
      retriever: {
        type: 'async',
        submit: { path: '/s', jobIdPath: ['id'] },
        poll: {
          path: '/s/{{ job.id }}',
          statusPath: ['status'],
          readyValue: 'R',
          resultUrlPath: ['u'],
        },
        download: { format: 'json', recordPath: ['rows'] },
      },
    };
    const r = RetrieverFactory.build(node, deps);
    assert.ok(r instanceof AsyncRetriever);
  });

  it('builds a SyncRetriever wired with a Paginator from node.pagination', async () => {
    const { Paginator } = await import('../../src/Core/Declarative/Paginator.js');
    const node = {
      request: { method: 'GET', path: '/x' },
      recordSelector: { recordPath: ['items'] },
      pagination: { type: 'cursor', cursorPath: ['next'], cursorParam: 'c' },
    };
    const r = RetrieverFactory.build(node, deps);
    assert.ok(r instanceof SyncRetriever);
    assert.ok(r.paginator instanceof Paginator);
    assert.strictEqual(r.paginator.type, 'cursor');
  });

  it('threads maxPages/maxRows into the sync retriever', () => {
    const node = {
      request: { method: 'GET', path: '/x' },
      recordSelector: { recordPath: ['data'] },
    };
    const r = RetrieverFactory.build(node, deps, { maxPages: 1, maxRows: 7 });
    assert.strictEqual(r.maxPages, 1);
    assert.strictEqual(r.maxRows, 7);
  });

  it('preserves defaults when no options given', () => {
    const node = {
      request: { method: 'GET', path: '/x' },
      recordSelector: { recordPath: ['data'] },
    };
    const r = RetrieverFactory.build(node, deps);
    assert.strictEqual(r.maxPages, 10000);
    assert.strictEqual(r.maxRows, Infinity);
  });

  it('threads maxRows into the async retriever', () => {
    const node = {
      retriever: {
        type: 'async',
        submit: { method: 'POST', path: '/j', jobIdPath: ['id'] },
        poll: {},
        download: { recordPath: ['rows'] },
      },
    };
    const r = RetrieverFactory.build(node, deps, { maxRows: 4 });
    assert.strictEqual(r.maxRows, 4);
  });
});
