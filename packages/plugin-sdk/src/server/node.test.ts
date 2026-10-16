// @vitest-environment node
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackend, exactCredential } from './node.js';
import { PRIVATE_ADDRESS_CODE } from './requester.js';

vi.mock('undici', () => ({ Agent: vi.fn(), fetch: vi.fn() }));

const HOST = 'https://app.owox.test';
const REPOSITORY_ID = '987654321';

type Lookup = (
  hostname: string,
  options: object,
  callback: (error: (Error & { code?: string }) | null, addresses: unknown[]) => void
) => void;

// node.ts builds its one agent on import.
const agentOptions = vi.mocked(Agent).mock.calls[0]![0] as { connect: { lookup: Lookup } };
const guardedAgent = vi.mocked(Agent).mock.instances[0];

function lookup(answer: { address: string; family: number }[] | Error) {
  vi.spyOn(dns, 'lookup').mockImplementation(((
    _hostname: string,
    _options: object,
    callback: (error: Error | null, addresses: unknown[]) => void
  ) => {
    if (answer instanceof Error) callback(answer, []);
    else callback(null, answer);
  }) as never);
  return new Promise<{ error: (Error & { code?: string }) | null; addresses: unknown[] }>(
    resolve => {
      agentOptions.connect.lookup('odm.example.test', {}, (error, addresses) =>
        resolve({ error, addresses })
      );
    }
  );
}

function contextResponse() {
  return new Response(
    JSON.stringify({
      executionId: 'e1',
      action: 'count',
      input: {},
      trigger: 'frontend',
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      pluginVersion: '1.0.0',
      installationId: 'i1',
      projectId: 'j1',
      userId: 'u1',
      plugin: { id: 'p1', repositoryId: REPOSITORY_ID },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

function actionRequest(host: string) {
  return new Request('https://backend.acme.test/owox', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-owox-execution-token': 'execution-token' },
    body: JSON.stringify({ owox: 1, host, executionId: 'e1' }),
  });
}

const nodeVersions = process.versions;

function withVersions(versions: NodeJS.ProcessVersions) {
  Object.defineProperty(process, 'versions', { value: versions, configurable: true });
}

describe('server/node', () => {
  const globalFetch = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.mocked(undiciFetch).mockReset();
    globalFetch.mockReset();
    vi.stubGlobal('fetch', globalFetch);
  });
  afterEach(() => {
    withVersions(nodeVersions);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('re-exports the server entry', () => {
    expect(typeof exactCredential).toBe('function');
  });

  it.each([
    ['127.0.0.1', 4],
    ['10.0.0.1', 4],
    ['169.254.169.254', 4],
    ['100.64.0.1', 4],
    ['::1', 6],
    ['fd00::1', 6],
    ['::ffff:10.0.0.1', 6],
  ])('refuses a name that resolves to %s', async (address, family) => {
    const { error, addresses } = await lookup([
      { address: '8.8.8.8', family: 4 },
      { address, family },
    ]);

    expect(error?.code).toBe(PRIVATE_ADDRESS_CODE);
    expect(error?.message).toBe('odm.example.test resolves to a private address');
    expect(addresses).toEqual([]);
  });

  it('connects to a name that resolves only to public addresses, asking for all of them', async () => {
    const answer = [
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ];

    expect(await lookup(answer)).toEqual({ error: null, addresses: answer });
    expect(vi.mocked(dns.lookup).mock.calls[0]![1]).toMatchObject({ all: true });
  });

  it('passes a DNS failure through', async () => {
    const failure = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });

    expect(await lookup(failure)).toEqual({ error: failure, addresses: [] });
  });

  it('sends every request to the host through the guarded agent without hosts', async () => {
    vi.mocked(undiciFetch)
      .mockResolvedValueOnce(contextResponse() as never)
      .mockResolvedValueOnce(
        new Response('{"items":[]}', { headers: { 'content-type': 'application/json' } }) as never
      );

    const response = await createBackend({
      repositoryId: REPOSITORY_ID,
      actions: { count: (_input, ctx) => ctx.owox.getJson('/api/data-marts') },
    }).fetch(actionRequest(HOST));

    expect(await response.json()).toEqual({ result: { items: [] } });
    expect(vi.mocked(undiciFetch).mock.calls.map(([url]) => String(url))).toEqual([
      `${HOST}/api/plugins/runtime/executions/current`,
      `${HOST}/api/data-marts`,
    ]);
    for (const [, init] of vi.mocked(undiciFetch).mock.calls) {
      expect(init).toMatchObject({ dispatcher: guardedAgent, redirect: 'manual' });
    }
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('still refuses a non-public host before any request', async () => {
    const response = await createBackend({ repositoryId: REPOSITORY_ID, actions: {} }).fetch(
      actionRequest('https://localhost')
    );

    expect(response.status).toBe(403);
    expect(undiciFetch).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'Bun', stub: () => withVersions({ ...process.versions, bun: '1.2.0' }) },
    { name: 'Deno', stub: () => vi.stubGlobal('Deno', {}) },
  ])('refuses to start without hosts on $name', ({ stub }) => {
    stub();

    expect(() => createBackend({ repositoryId: REPOSITORY_ID, actions: {} })).toThrow(
      'createBackend: @owox/plugin-sdk/server/node checks addresses only on Node; list hosts on this runtime'
    );
    expect(() =>
      createBackend({ repositoryId: REPOSITORY_ID, hosts: [HOST], actions: {} })
    ).not.toThrow();
  });

  it('uses plain fetch when hosts lists the deployments', async () => {
    globalFetch.mockResolvedValueOnce(contextResponse());

    const response = await createBackend({
      repositoryId: REPOSITORY_ID,
      hosts: ['http://odm.internal:3000'],
      actions: { count: () => 'ok' },
    }).fetch(actionRequest('http://odm.internal:3000'));

    expect(await response.json()).toEqual({ result: 'ok' });
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(undiciFetch).not.toHaveBeenCalled();
  });
});
