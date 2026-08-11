import { BadRequestException } from '@nestjs/common';
import { join } from 'path';
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
jest.mock('cross-spawn', () => ({
  __esModule: true,
  spawn: (...args: Parameters<typeof actualCrossSpawn.spawn>) => {
    const options = args[2] as { env?: Record<string, string | undefined> } | undefined;
    capturedSpawnEnv = options?.env;
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
});
