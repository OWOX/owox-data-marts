import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AsyncRetriever } from '../../src/Core/Declarative/AsyncRetriever.js';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';

// Stub DNS so SsrfGuard never hits the network. The download host resolves to a
// public IP; literal private IPs are echoed back (caught by the literal check).
const stubDns = async host => {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return [{ address: host, family: 4 }];
  return [{ address: '93.184.216.34', family: 4 }];
};
const guardFor = hosts => new SsrfGuard(hosts, { lookup: stubDns });

describe('AsyncRetriever', () => {
  it('submits, polls until READY, downloads, and extracts', async () => {
    const sent = [];
    const requester = {
      async send(spec, scope) {
        // The poll path is marked opaque (it already carries the response-derived
        // job id and must not be rendered again), so read it through String().
        const path = String(spec.path);
        sent.push(path);
        if (path === '/reports') return { id: 'JOB1' };
        if (path === '/reports/JOB1/status') {
          return sent.filter(p => p.includes('status')).length < 2
            ? { status: 'PENDING' }
            : { status: 'READY', location_json: 'https://cdn.example/JOB1.json' };
        }
        throw new Error(`unexpected path ${path}`);
      },
    };
    const httpClient = {
      async urlFetchWithRetry(url) {
        assert.strictEqual(url, 'https://cdn.example/JOB1.json');
        return {
          async json() {
            return { rows: [{ a: 1 }, { a: 2 }] };
          },
        };
      },
    };
    const retriever = new AsyncRetriever({
      requester,
      httpClient,
      ssrfGuard: guardFor([]),
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      config: {
        submit: { method: 'POST', path: '/reports', body: {}, jobIdPath: ['id'] },
        poll: {
          method: 'GET',
          path: '/reports/{{ job.id }}/status',
          statusPath: ['status'],
          readyValue: 'READY',
          failedValue: 'FAILED',
          resultUrlPath: ['location_json'],
          backoff: { initialMs: 1, maxMs: 1, maxAttempts: 5 },
        },
        download: { format: 'json', recordPath: ['rows'] },
      },
      sleep: async () => {},
    });

    const records = await retriever.run({ parameters: {} });
    assert.deepStrictEqual(records, [{ a: 1 }, { a: 2 }]);
  });

  it('passes a per-hop validator (assertPublicHttps) to the download fetch so redirects re-validate', async () => {
    let capturedValidate;
    const requester = {
      async send(spec) {
        if (spec.path === '/reports') return { id: 'JOB1' };
        return { status: 'READY', location_json: 'https://cdn.example/JOB1.json' };
      },
    };
    const httpClient = {
      async urlFetchWithRetry(url, options, validate) {
        capturedValidate = validate;
        return {
          async json() {
            return { rows: [{ a: 1 }] };
          },
        };
      },
    };
    const retriever = new AsyncRetriever({
      requester,
      httpClient,
      ssrfGuard: guardFor([]),
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      config: {
        submit: { method: 'POST', path: '/reports', body: {}, jobIdPath: ['id'] },
        poll: {
          method: 'GET',
          path: '/reports/{{ job.id }}/status',
          statusPath: ['status'],
          readyValue: 'READY',
          failedValue: 'FAILED',
          resultUrlPath: ['location_json'],
          backoff: { initialMs: 1, maxMs: 1, maxAttempts: 5 },
        },
        download: { format: 'json', recordPath: ['rows'] },
      },
      sleep: async () => {},
    });
    await retriever.run({ parameters: {} });
    assert.strictEqual(
      typeof capturedValidate,
      'function',
      'AsyncRetriever must thread a validate callback'
    );
    // The validator enforces public-https (no allowlist) on a redirect Location:
    await assert.doesNotReject(() => capturedValidate('https://cdn.other.example/r.json'));
    await assert.rejects(() => capturedValidate('https://169.254.169.254/r'), /blocked IP/);
  });

  it('throws when the job reports FAILED', async () => {
    const requester = {
      async send(spec) {
        if (spec.path === '/reports') return { id: 'J' };
        return { status: 'FAILED' };
      },
    };
    const retriever = new AsyncRetriever({
      requester,
      httpClient: {
        async urlFetchWithRetry() {
          throw new Error('no download');
        },
      },
      ssrfGuard: guardFor([]),
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      config: {
        submit: { method: 'POST', path: '/reports', body: {}, jobIdPath: ['id'] },
        poll: {
          method: 'GET',
          path: '/reports/{{ job.id }}/status',
          statusPath: ['status'],
          readyValue: 'READY',
          failedValue: 'FAILED',
          resultUrlPath: ['location_json'],
          backoff: { initialMs: 1, maxMs: 1, maxAttempts: 5 },
        },
        download: { format: 'json', recordPath: ['rows'] },
      },
      sleep: async () => {},
    });
    await assert.rejects(() => retriever.run({ parameters: {} }), /job failed/i);
  });
});
