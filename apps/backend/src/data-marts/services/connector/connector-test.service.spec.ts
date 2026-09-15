import { BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { join } from 'path';
import { PassThrough } from 'stream';
import { Core } from '@owox/connectors';
import { ConnectorTestService } from './connector-test.service';
import {
  MAX_CAPTURED_LINE_LENGTH,
  TRUNCATED_OUTPUT_LINE,
} from './connector-process-spawner.service';

// Wrap the real `cross-spawn` so we can capture the `env` object the service
// builds for the child process, without altering the actual spawn behavior
// (the fake-runner fixture must still really execute).
const actualCrossSpawn = jest.requireActual<typeof import('cross-spawn')>('cross-spawn');
let capturedSpawnEnv: Record<string, string | undefined> | undefined;
/**
 * When set, the child is a stub whose stdout/stderr the test writes byte by byte instead
 * of a real process. Only the chunk-boundary cases use it: where a pipe splits a chunk is
 * the kernel's decision, so a real child cannot be made to split a character on demand.
 */
let stubbedChild: (() => unknown) | undefined;
jest.mock('cross-spawn', () => ({
  __esModule: true,
  spawn: (...args: Parameters<typeof actualCrossSpawn.spawn>) => {
    const options = args[2] as { env?: Record<string, string | undefined> } | undefined;
    capturedSpawnEnv = options?.env;
    if (stubbedChild) {
      return stubbedChild() as ReturnType<typeof actualCrossSpawn.spawn>;
    }
    return actualCrossSpawn.spawn(...args);
  },
}));

describe('ConnectorTestService helpers', () => {
  const svc = new ConnectorTestService();

  it('wrapConfig wraps each flat value as { value }', () => {
    expect(svc.wrapConfig({ ApiKey: 'k', Limit: 5 })).toEqual({
      ApiKey: { value: 'k' },
      Limit: { value: 5 },
    });
  });

  it('pruneToNode keeps only the selected node', () => {
    const manifest = { name: 'X', nodes: { a: { request: {} }, b: { request: {} } } } as Record<
      string,
      unknown
    >;
    const pruned = svc.pruneToNode(manifest, 'b');
    expect(Object.keys((pruned as { nodes: Record<string, unknown> }).nodes)).toEqual(['b']);
  });

  it('pruneToNode throws on unknown node', () => {
    expect(() =>
      svc.pruneToNode({ name: 'X', nodes: { a: {} } } as Record<string, unknown>, 'z')
    ).toThrow();
  });

  it('pruneToNode throws BadRequestException with exact message for unknown node', () => {
    expect(() =>
      svc.pruneToNode({ name: 'X', nodes: { a: {} } } as Record<string, unknown>, 'missing')
    ).toThrow(new BadRequestException('Unknown node "missing"'));
  });

  it('selectNodeFields builds a "node field, ..." selection for all declared fields', () => {
    const m = {
      nodes: { items: { fields: { id: { type: 'integer' }, name: { type: 'string' } } } },
    } as Record<string, unknown>;
    expect(svc.selectNodeFields(m, 'items')).toBe('items id, items name');
  });

  it('selectNodeFields returns "" for a node with no declared fields', () => {
    const m = { nodes: { items: { fields: {} } } } as Record<string, unknown>;
    expect(svc.selectNodeFields(m, 'items')).toBe('');
  });

  it('selectNodeFields returns "" when the node has no fields key at all', () => {
    const m = { nodes: { items: {} } } as Record<string, unknown>;
    expect(svc.selectNodeFields(m, 'items')).toBe('');
  });
});

describe('ConnectorTestService.runTest (against a fake runner)', () => {
  const fakeRunner = join(__dirname, '../../../../test/fixtures/fake-test-runner.mjs');

  function makeService() {
    const svc = new ConnectorTestService();
    (svc as unknown as { runnerPath: () => string }).runnerPath = () => fakeRunner;
    return svc;
  }

  const manifest = {
    version: '1.0',
    name: 'X',
    baseUrl: 'https://api.example.com',
    parameters: {},
    nodes: {
      items: {
        request: { method: 'GET', path: '/x' },
        recordSelector: { recordPath: ['data'] },
        fields: { i: { type: 'integer' } },
      },
    },
  };

  it('collects rows up to maxRows and reports no error', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
    });
    expect(res.rows.length).toBe(3);
    expect(res.error).toBeNull();
    expect(res.logs.join(' ')).toContain('starting fake run');
  });

  it('forwards a Fields selection for the node so the connector fetches it', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
    });
    expect(res.logs.join('\n')).toContain('fields=items i');
  });

  it('flags a silent 0-row result (no error) so it is visible to humans and the AI fix flow', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
      _testEnv: { FAKE_SAMPLE_NO_ROWS: '1' },
    });
    expect(res.error).toBeNull();
    expect(res.rows.length).toBe(0);
    const joined = res.logs.join('\n');
    expect(joined).toContain('Test produced 0 records');
    // a raw sample was received → the diagnostic must point at recordPath
    expect(joined).toMatch(/raw response sample WAS received/i);
  });

  it('surfaces an error-level engine log (e.g. auth 401) as the test error when the run exits 0 with no rows', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
      _testEnv: { FAKE_ERROR_LOG: '1' },
    });
    expect(res.rows.length).toBe(0);
    // the auth failure is now the test error, not a misleading null/"0 rows OK"
    expect(res.error).toMatch(/HTTP 401|api key/i);
    // the 0-records diagnostic must NOT also fire once a real error is surfaced
    expect(res.logs.join('\n')).not.toContain('Test produced 0 records');
  });

  it('does NOT add the 0-records diagnostic when rows were returned', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
    });
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.logs.join('\n')).not.toContain('Test produced 0 records');
  });

  it('times out and returns an error when the runner hangs', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
      timeoutMs: 300,
      _hang: true,
    });
    expect(res.error).toMatch(/timed out/i);
  }, 2000);

  it('collects the raw SAMPLE event into result.sample', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
    });
    expect(res.sample).toEqual([{ id: 1, name: 'a', nested: { k: 'v' } }]);
    expect(res.rows.length).toBe(3);
    expect(res.logs.join('\n')).not.toContain('"type":"SAMPLE"');
  });

  it('forces a synthetic Fields selection and blanks rows for a node with no declared fields', async () => {
    const svc = makeService();
    const noFieldsManifest = {
      version: '1.0',
      name: 'X',
      baseUrl: 'https://api.example.com',
      parameters: {},
      nodes: {
        items: {
          request: { method: 'GET', path: '/x' },
          recordSelector: { recordPath: ['data'] },
          fields: {},
        },
      },
    };
    const res = await svc.runTest({
      projectId: 'p',
      manifest: noFieldsManifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
    });
    const cfg = JSON.parse(capturedSpawnEnv!.OW_CONFIG!) as {
      source: { config: { Fields?: { value: string } } };
    };
    expect(cfg.source.config.Fields?.value).toBe('items __owox_sample__');
    expect(res.rows).toEqual([]);
    expect(res.sample).toEqual([{ id: 1, name: 'a', nested: { k: 'v' } }]);
    expect(res.logs.join('\n')).not.toContain('Test produced 0 records');
  });

  it('throws BadRequestException starting with "Invalid manifest:" when the manifest fails parsing, before spawning any process', async () => {
    const svc = makeService();
    // Manifest has nodes.items so pruneToNode succeeds, but is missing required
    // top-level keys (version, baseUrl, parameters) so ManifestParser rejects it.
    const badManifest = {
      name: 'X',
      nodes: { items: { request: { method: 'GET', path: '/x' } } },
    } as Record<string, unknown>;
    await expect(
      svc.runTest({ projectId: 'p', manifest: badManifest, node: 'items', configuration: {} })
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.runTest({ projectId: 'p', manifest: badManifest, node: 'items', configuration: {} })
    ).rejects.toThrow(/^Invalid manifest:/);
  });

  /**
   * A test runs ONE node, so it parses the pruned manifest and a broken sibling node goes
   * unseen -- but publish() parses the whole thing and refuses it. That gap is the common
   * shape of an assistant-authored connector: node one is written and tested, node two is
   * written and never tested, `connector_test` passes, and publish rejects the connector.
   *
   * Surfaced in the log trail rather than thrown, because the caller asked about THIS node
   * and is entitled to an answer about it: an author iterating on node one with node two
   * half-written must not be locked out of testing. The trail is where a test's other
   * unhappy news already lands (the 0-record diagnostic), the MCP facade carries it back
   * newest-first, and it names the node the parser objected to.
   */
  describe('a sibling node the parser rejects', () => {
    const twoNodeManifest = (broken: Record<string, unknown>) => ({
      ...manifest,
      nodes: { ...manifest.nodes, orders: broken },
    });

    it('warns about the node that will block publishing, and still runs the node under test', async () => {
      const svc = makeService();

      const res = await svc.runTest({
        projectId: 'p',
        // `orders` has no recordSelector, which ManifestParser refuses.
        manifest: twoNodeManifest({ request: { method: 'GET', path: '/orders' } }),
        node: 'items',
        configuration: {},
        maxRows: 3,
      });

      expect(res.rows.length).toBe(3);
      expect(res.error).toBeNull();
      const logs = res.logs.join('\n');
      expect(logs).toContain('orders');
      expect(logs).toContain('recordSelector');
      expect(logs).toMatch(/cannot be published/i);
    });

    it('says nothing when every other node parses', async () => {
      const svc = makeService();

      const res = await svc.runTest({
        projectId: 'p',
        manifest: twoNodeManifest({
          request: { method: 'GET', path: '/orders' },
          recordSelector: { recordPath: ['data'] },
          fields: { i: { type: 'integer' } },
        }),
        node: 'items',
        configuration: {},
        maxRows: 3,
      });

      expect(res.logs.join('\n')).not.toMatch(/cannot be published/i);
    });

    it('still refuses outright when the node under test is itself invalid', async () => {
      const svc = makeService();

      // The node being tested has no recordSelector: nothing to run, so this stays a 400.
      await expect(
        svc.runTest({
          projectId: 'p',
          manifest: {
            ...manifest,
            nodes: { items: { request: { method: 'GET', path: '/x' } } },
          },
          node: 'items',
          configuration: {},
        })
      ).rejects.toThrow(/^Invalid manifest:/);
    });
  });

  it('reports error "Test process exited with code N" when the runner exits non-zero and emitted no rows', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
      _testEnv: { FAKE_EXIT_CODE: '2' },
    });
    expect(res.rows.length).toBe(0);
    expect(res.error).toBe('Test process exited with code 2');
  });

  it('reports no error when the runner exits non-zero but rows were already emitted', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
      _testEnv: { FAKE_EXIT_CODE: '1', FAKE_EXIT_ROWS: '2' },
    });
    expect(res.rows.length).toBe(2);
    expect(res.error).toBeNull();
  });

  it('silently drops a malformed marker line and still counts valid rows', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
      _testEnv: { FAKE_MALFORMED_ROW: '1' },
    });
    // The malformed line is dropped; only the one valid row is counted
    expect(res.rows.length).toBe(1);
    expect(res.error).toBeNull();
  });

  /**
   * The live-test child is the one that runs many at a time (up to
   * MAX_CONNECTOR_TESTS_TOTAL concurrently), so an unbounded pending line here is
   * multiplied by the concurrency cap. It must hold the same per-line bound the
   * production spawner already applies to the same runner.
   */
  it('bounds an oversized child output line at the production spawner cap, on both streams', async () => {
    const svc = makeService();
    const res = await svc.runTest({
      projectId: 'p',
      manifest,
      node: 'items',
      configuration: {},
      maxRows: 3,
      _testEnv: { FAKE_HUGE_LINE: '1' },
    });

    const longest = res.logs.reduce((max, line) => Math.max(max, line.length), 0);
    expect(longest).toBeLessThanOrEqual(MAX_CAPTURED_LINE_LENGTH);
    // stdout and stderr each overflowed, so each must have contributed a notice.
    expect(res.logs.filter(line => line === TRUNCATED_OUTPUT_LINE)).toHaveLength(2);
    // Truncating the oversized line must not swallow what the child wrote after it.
    expect(res.logs).toContain('starting fake run');
    expect(res.rows).toEqual([{ i: 0 }]);
  }, 15000);

  /**
   * A node with an `incremental` block is walked ONE REQUEST PER DAY by the engine, and
   * the window it walks comes from `_getIncrementalStartDate`: with no LastRequestedDate
   * the engine falls back to the 1st of the PREVIOUS month, i.e. 29-62 days. Nothing in
   * the test path used to narrow that, so pressing "Test" on a day-by-day node fired one
   * upstream request per day of a backfill window — and the case it hurt most is the one
   * Test exists to debug, a node returning 0 rows, where nothing stops the walk early and
   * the 20s budget expires on empty days with a generic "timed out" instead of the
   * 0-records diagnostic.
   *
   * The builder writes `incremental` and never `isTimeSeries`, so choosing "Day-by-day"
   * in the UI is by itself enough to reach this path.
   */
  describe('the date window a live test samples', () => {
    /**
     * The contract, not the constant: a live test may sample at most a week of history.
     * Deliberately not imported from the service — a test that re-derives the number it
     * is checking asserts nothing. What must hold is that the window is small and ends
     * today, whatever exact figure the service settles on.
     */
    const MAX_SAMPLED_DAYS = 7;

    const dayByDayManifest = {
      ...manifest,
      nodes: {
        items: {
          ...manifest.nodes.items,
          incremental: { strategy: 'day-by-day' },
        },
      },
    };

    /** The source config the service actually handed the child, unwrapped. */
    function spawnedSourceConfig(): Record<string, { value: unknown }> {
      const cfg = JSON.parse(capturedSpawnEnv!.OW_CONFIG!) as {
        source: { config: Record<string, { value: unknown }> };
      };
      return cfg.source.config;
    }

    /**
     * How many days the engine would walk, derived exactly as it derives them:
     * `[LastRequestedDate - ReimportLookbackWindow, today]`, inclusive, in UTC.
     */
    function daysTheEngineWouldWalk(config: Record<string, { value: unknown }>): number {
      const lastRequested = String(config.LastRequestedDate?.value ?? '');
      const lookbackDays = Number(config.ReimportLookbackWindow?.value ?? 0) || 0;
      const startMs = Date.parse(`${lastRequested}T00:00:00.000Z`) - lookbackDays * 86400000;
      const endMs = Date.parse(`${new Date().toISOString().split('T')[0]}T00:00:00.000Z`);
      return Math.round((endMs - startMs) / 86400000) + 1;
    }

    it('clamps a day-by-day node to a bounded sample instead of the default backfill window', async () => {
      const svc = makeService();
      capturedSpawnEnv = undefined;

      await svc.runTest({
        projectId: 'p',
        manifest: dayByDayManifest,
        node: 'items',
        configuration: {},
        maxRows: 3,
      });

      const days = daysTheEngineWouldWalk(spawnedSourceConfig());
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(MAX_SAMPLED_DAYS);
    });

    it('cannot be widened by the manifest configuration, which is what makes the bound a bound', async () => {
      const svc = makeService();
      capturedSpawnEnv = undefined;

      await svc.runTest({
        projectId: 'p',
        manifest: dayByDayManifest,
        node: 'items',
        configuration: {
          // Both of the values the engine reads when it computes the window. A
          // configuration that could set them could reinstate the full walk.
          LastRequestedDate: '2020-01-01',
          ReimportLookbackWindow: 90,
        },
        maxRows: 3,
      });

      const days = daysTheEngineWouldWalk(spawnedSourceConfig());
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(MAX_SAMPLED_DAYS);
    });

    it('still delivers the 0-records diagnostic, and names the window it sampled', async () => {
      const svc = makeService();
      capturedSpawnEnv = undefined;

      const res = await svc.runTest({
        projectId: 'p',
        manifest: dayByDayManifest,
        node: 'items',
        configuration: {},
        maxRows: 3,
        _testEnv: { FAKE_SAMPLE_NO_ROWS: '1' },
      });

      const joined = res.logs.join('\n');
      expect(res.error).toBeNull();
      expect(joined).toContain('Test produced 0 records');
      expect(joined).toMatch(/raw response sample WAS received/i);
      // The clamp creates its own way to read 0 records wrongly — a date-partitioned
      // node whose sampled days simply have no data — so the diagnostic has to say
      // which days were asked for.
      const start = String(spawnedSourceConfig().LastRequestedDate?.value);
      const today = new Date().toISOString().split('T')[0];
      expect(joined).toContain(start);
      expect(joined).toContain(today);
    });
  });

  it('spawns the test child with an allow-listed env: no ambient secret leaks, but the runner-required keys are present', async () => {
    const svc = makeService();
    const ambient: Record<string, string> = {
      SENTINEL_SECRET: 'nope',
      // A live test calls the same third-party APIs a production run does, so
      // it needs the same corporate trust anchor — but never the egress gate.
      NODE_EXTRA_CA_CERTS: '/etc/ssl/corp-ca.pem',
      OW_ALLOW_LOCAL_EGRESS: '1',
    };
    const previous = Object.keys(ambient).map(
      key => [key, process.env[key]] as [string, string | undefined]
    );
    Object.assign(process.env, ambient);
    capturedSpawnEnv = undefined;
    try {
      await svc.runTest({ projectId: 'p', manifest, node: 'items', configuration: {}, maxRows: 3 });
      expect(capturedSpawnEnv).toBeDefined();
      // Ambient secrets on the parent process must NOT leak into the child.
      expect(capturedSpawnEnv?.SENTINEL_SECRET).toBeUndefined();
      // The runner's genuinely-required keys must be present.
      expect(capturedSpawnEnv?.PATH).toBe(process.env.PATH);
      expect(capturedSpawnEnv?.NODE_EXTRA_CA_CERTS).toBe('/etc/ssl/corp-ca.pem');
      // The test panel must never be able to reach a private host.
      expect(capturedSpawnEnv?.OW_ALLOW_LOCAL_EGRESS).toBeUndefined();
      expect(capturedSpawnEnv?.OW_MANIFEST).toBeDefined();
      expect(capturedSpawnEnv?.OW_CONFIG).toBeDefined();
      expect(capturedSpawnEnv?.OW_RUN_CONFIG).toBeDefined();
      expect(capturedSpawnEnv?.OW_DATAMART_ID).toBe('test');
      expect(capturedSpawnEnv?.OW_RUN_ID).toBe('test');
      expect(capturedSpawnEnv?.OW_TEST).toBe('1');
      expect(capturedSpawnEnv?.OW_TEST_MAX_ROWS).toBe('3');
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  /**
   * The manifest and the configuration both reach the runner as process ENVIRONMENT
   * STRINGS, and Linux refuses a single one longer than MAX_ARG_STRLEN (131072 bytes) with
   * E2BIG. The HTTP DTO bounds what it receives; the MCP `connector_test` tool takes both
   * through its own Zod schema and the MCP transport accepts a 2 MiB body, so without a
   * bound on the service the spawn fails and the caller is handed a raw "spawn node E2BIG"
   * on an otherwise 200-shaped result.
   *
   * The number is re-stated rather than imported on purpose, as in
   * connector-definition.service.spec.ts: it is a reasoned trade-off against a kernel
   * limit, so moving it should turn these red rather than have them silently follow.
   */
  describe('the ceiling on what can be handed to the child process', () => {
    const MAX_MANIFEST_SIZE_BYTES = 120 * 1024;

    /** `{"pad":"<x's>"}` -- the padding plus 10 bytes of envelope. */
    const payloadOfSize = (bytes: number) => ({ pad: 'x'.repeat(bytes - 10) });
    /**
     * A configuration whose WRAPPED form is exactly `bytes` long. The service measures the
     * wrapped one because that is what OW_CONFIG carries: `{"pad":{"value":"<x's>"}}` is
     * the padding plus 20 bytes of envelope.
     */
    const configOfWrappedSize = (bytes: number) => ({ pad: 'x'.repeat(bytes - 20) });

    it('pads to exactly the byte lengths the service measures', () => {
      // Guards the helpers: every boundary case below only means something while this holds.
      const svc = makeService();
      for (const size of [MAX_MANIFEST_SIZE_BYTES, MAX_MANIFEST_SIZE_BYTES + 1]) {
        expect(Buffer.byteLength(JSON.stringify(payloadOfSize(size)), 'utf8')).toBe(size);
        expect(
          Buffer.byteLength(JSON.stringify(svc.wrapConfig(configOfWrappedSize(size))), 'utf8')
        ).toBe(size);
      }
    });

    it('refuses a manifest too large for the runner to receive, without spawning anything', async () => {
      const svc = makeService();
      capturedSpawnEnv = undefined;

      await expect(
        svc.runTest({
          projectId: 'p',
          manifest: payloadOfSize(MAX_MANIFEST_SIZE_BYTES + 1),
          node: 'items',
          configuration: {},
        })
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.runTest({
          projectId: 'p',
          manifest: payloadOfSize(MAX_MANIFEST_SIZE_BYTES + 1),
          node: 'items',
          configuration: {},
        })
      ).rejects.toThrow(new RegExp(`${MAX_MANIFEST_SIZE_BYTES}-byte limit`));
      // E2BIG is what the guard exists to prevent, so the refusal must come first.
      expect(capturedSpawnEnv).toBeUndefined();
    });

    it('refuses a configuration too large for the runner to receive, without spawning anything', async () => {
      const svc = makeService();
      capturedSpawnEnv = undefined;

      await expect(
        svc.runTest({
          projectId: 'p',
          manifest,
          node: 'items',
          configuration: configOfWrappedSize(MAX_MANIFEST_SIZE_BYTES + 1),
        })
      ).rejects.toThrow(new RegExp(`${MAX_MANIFEST_SIZE_BYTES}-byte limit`));
      expect(capturedSpawnEnv).toBeUndefined();
    });

    /**
     * MAX_ARG_STRLEN is a BYTE budget, and both payloads are user-authored text: labels,
     * descriptions and parameter values are routinely non-ASCII. A character count would
     * wave through a payload three times over the kernel's limit.
     */
    it('measures the ceiling in bytes, not characters', async () => {
      const svc = makeService();
      // 41000 '€' (3 bytes each) = 123000 bytes of padding: well past the ceiling in
      // bytes, well under it in characters.
      const multiByte = { pad: '€'.repeat(41000) };
      expect(JSON.stringify(multiByte).length).toBeLessThan(MAX_MANIFEST_SIZE_BYTES);

      await expect(
        svc.runTest({ projectId: 'p', manifest: multiByte, node: 'items', configuration: {} })
      ).rejects.toThrow(new RegExp(`${MAX_MANIFEST_SIZE_BYTES}-byte limit`));
    });

    /**
     * At the ceiling the payload is still refused -- but by `pruneToNode`, for having no
     * such node, which is the next thing that runs. That is what says the size guard let it
     * through rather than that it never fired.
     */
    it('accepts payloads of exactly the ceiling', async () => {
      const svc = makeService();

      await expect(
        svc.runTest({
          projectId: 'p',
          manifest: payloadOfSize(MAX_MANIFEST_SIZE_BYTES),
          node: 'items',
          configuration: configOfWrappedSize(MAX_MANIFEST_SIZE_BYTES),
        })
      ).rejects.toThrow(/^Unknown node/);
    });

    /**
     * The guard runs ahead of acquireTestSlot. A slot bounds child processes, and a payload
     * that can never produce one must not be able to hold one -- otherwise a caller that
     * only ever sends oversized manifests locks its project's real tests out.
     */
    it('does not consume a concurrency slot for a payload it refuses', async () => {
      const svc = makeService();
      const oversized = {
        projectId: 'p',
        manifest: payloadOfSize(MAX_MANIFEST_SIZE_BYTES + 1),
        node: 'items',
        configuration: {},
      };

      // More refusals than DEFAULT_MAX_TESTS_PER_PROJECT (3), so a leaked slot saturates.
      for (let i = 0; i < 5; i++) {
        await expect(svc.runTest(oversized)).rejects.toThrow(BadRequestException);
      }

      const res = await svc.runTest({
        projectId: 'p',
        manifest,
        node: 'items',
        configuration: {},
        maxRows: 3,
      });
      expect(res.rows.length).toBe(3);
    });
  });

  /**
   * A pipe hands over bytes, not characters, so a multi-byte UTF-8 sequence is routinely
   * split across two chunks -- at every 64 KiB boundary of a large response, which is
   * exactly the size at which a connector echoes real payload data. Decoding each chunk on
   * its own turns the split character into U+FFFD in both halves, silently corrupting the
   * non-ASCII sample rows and log lines the test panel exists to show.
   *
   * Driven through a stub child because where a pipe splits is the kernel's decision: a
   * real child cannot be asked to break a character in two.
   */
  describe('output whose characters straddle a chunk boundary', () => {
    /** Let the stream machinery deliver what was just written before writing more. */
    const settle = () => new Promise(resolve => setImmediate(resolve));

    function makeStubChild() {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        pid: 4242,
        // Set to 0 before `close` is emitted, so stopChild sees a reaped child and the
        // result resolves without waiting on a signal nothing would receive.
        exitCode: null as number | null,
        signalCode: null as string | null,
        kill: () => true,
      });
      return child;
    }

    /** Write `line` to `stream` as two chunks, splitting at byte `splitAt`. */
    async function writeSplit(stream: PassThrough, line: Buffer, splitAt: number): Promise<void> {
      stream.write(line.subarray(0, splitAt));
      await settle();
      stream.write(line.subarray(splitAt));
      await settle();
    }

    async function runAgainstStub(
      write: (child: ReturnType<typeof makeStubChild>) => Promise<void>
    ) {
      const svc = makeService();
      const child = makeStubChild();
      stubbedChild = () => child;
      try {
        const run = svc.runTest({
          projectId: 'p',
          manifest,
          node: 'items',
          configuration: {},
          maxRows: 3,
        });
        await write(child);
        child.exitCode = 0;
        child.emit('close', 0);
        return await run;
      } finally {
        stubbedChild = undefined;
      }
    }

    it('keeps a two-byte character intact in a sample row split across stdout chunks', async () => {
      const line = Buffer.from(`${String(Core.TEST_ROW_MARKER)}{"city":"Kraków"}\n`, 'utf8');
      // 0xC3 leads the two bytes of 'ó' (U+00F3), and nothing else in the line is
      // non-ASCII, so one past it is inside the character and nowhere else.
      const res = await runAgainstStub(child =>
        writeSplit(child.stdout, line, line.indexOf(0xc3) + 1)
      );

      expect(res.rows).toEqual([{ city: 'Kraków' }]);
      expect(JSON.stringify(res.rows)).not.toContain('�');
    });

    it('keeps a four-byte character intact in a log line split across stderr chunks', async () => {
      const line = Buffer.from('fetch failed for 東京 🚀\n', 'utf8');
      // 0xF0 leads the four bytes of '🚀' (U+1F680); two past it is mid-sequence.
      const res = await runAgainstStub(child =>
        writeSplit(child.stderr, line, line.indexOf(0xf0) + 2)
      );

      expect(res.logs).toContain('fetch failed for 東京 🚀');
    });
  });
});
