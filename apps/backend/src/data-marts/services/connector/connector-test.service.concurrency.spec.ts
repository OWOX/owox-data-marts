import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ChildProcess } from 'child_process';
import { join } from 'path';
import { ConcurrencyLimitExceededException } from '../../../common/exceptions/concurrency-limit-exceeded.exception';
import { ConnectorTestService } from './connector-test.service';

// Wrap the real `cross-spawn` so the fake-runner fixture still really executes, while
// this spec can count how many child processes were started and how many were alive at
// the same moment. The HTTP status of a refusal can be right while the process cap
// leaks, so the assertions below are on the spawns, not only on the rejections.
const actualCrossSpawn = jest.requireActual<typeof import('cross-spawn')>('cross-spawn');
let spawnCalls = 0;
let maxLiveChildren = 0;
let lastSpawnedChild: ChildProcess | null = null;
const liveChildren = new Set<ChildProcess>();
jest.mock('cross-spawn', () => ({
  __esModule: true,
  spawn: (...args: Parameters<typeof actualCrossSpawn.spawn>) => {
    spawnCalls += 1;
    const child = actualCrossSpawn.spawn(...args);
    lastSpawnedChild = child;
    liveChildren.add(child);
    // A Set rather than a counter: a straggler from a previous test decrements only
    // itself, so the observed maximum can never be driven negative and hide a breach.
    maxLiveChildren = Math.max(maxLiveChildren, liveChildren.size);
    child.on('close', () => liveChildren.delete(child));
    return child;
  },
}));

const fakeRunner = join(__dirname, '../../../../test/fixtures/fake-test-runner.mjs');

const MANIFEST = {
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

/**
 * A ConnectorTestService whose child process is the fake-runner fixture, with the
 * concurrency limits supplied through a stub ConfigService — the same keys the wired
 * app reads from the validated environment.
 */
function makeService(limits: { perProject?: number; total?: number } = {}): ConnectorTestService {
  const configService = {
    get: (key: string, defaultValue?: unknown) => {
      if (key === 'MAX_CONNECTOR_TESTS_PER_PROJECT' && limits.perProject !== undefined) {
        return limits.perProject;
      }
      if (key === 'MAX_CONNECTOR_TESTS_TOTAL' && limits.total !== undefined) {
        return limits.total;
      }
      return defaultValue;
    },
  } as unknown as ConfigService;
  const svc = new ConnectorTestService(configService);
  (svc as unknown as { runnerPath: () => string }).runnerPath = () => fakeRunner;
  return svc;
}

/** Arguments for a run that occupies its slot until the per-test budget expires. */
function occupyingRun(projectId: string) {
  return {
    projectId,
    manifest: MANIFEST,
    node: 'items',
    configuration: {},
    maxRows: 3,
    timeoutMs: 400,
    _hang: true,
  };
}

/** Arguments for a run that finishes immediately. */
function quickRun(projectId: string) {
  return { projectId, manifest: MANIFEST, node: 'items', configuration: {}, maxRows: 3 };
}

describe('ConnectorTestService concurrency limit', () => {
  beforeEach(() => {
    spawnCalls = 0;
    maxLiveChildren = 0;
  });

  // Children are SIGTERMed when a run settles, but the process is reaped a tick later.
  // Draining here keeps a straggler from inflating the next test's observed maximum.
  afterEach(async () => {
    for (let i = 0; i < 100 && liveChildren.size > 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    liveChildren.clear();
  });

  // ---------------------------------------------------------------------------
  // Release. Written first on purpose: a semaphore that never releases turns the
  // endpoint into a one-shot, which is a worse bug than unbounded concurrency.
  // ---------------------------------------------------------------------------

  it('releases the slot after a successful test, so a later call still runs', async () => {
    const svc = makeService({ perProject: 1 });

    const first = await svc.runTest(quickRun('p1'));
    expect(first.error).toBeNull();

    const second = await svc.runTest(quickRun('p1'));
    expect(second.error).toBeNull();
    expect(spawnCalls).toBe(2);
  });

  it('releases the slot after a failing test', async () => {
    const svc = makeService({ perProject: 1 });

    const failed = await svc.runTest({
      ...quickRun('p1'),
      _testEnv: { FAKE_EXIT_CODE: '2' },
    });
    expect(failed.error).toBe('Test process exited with code 2');

    const next = await svc.runTest(quickRun('p1'));
    expect(next.error).toBeNull();
    expect(spawnCalls).toBe(2);
  });

  it('releases the slot after a test times out', async () => {
    const svc = makeService({ perProject: 1 });

    const timedOut = await svc.runTest({ ...occupyingRun('p1'), timeoutMs: 200 });
    expect(timedOut.error).toMatch(/timed out/i);

    const next = await svc.runTest(quickRun('p1'));
    expect(next.error).toBeNull();
    expect(spawnCalls).toBe(2);
  });

  /**
   * The slot exists to bound CHILD PROCESSES, so it may only be handed back once the
   * child this run started is actually gone. `finish()` sent SIGTERM and resolved in the
   * same tick, which frees the slot a microtask later — before the OS has done anything.
   *
   * With no SIGTERM listener a child takes the OS default and dies promptly, so nothing
   * is reachable today; this is the guard for the day a runner installs one (to flush
   * state on shutdown, say), at which point the cap would count slots that no longer
   * correspond to processes and the deployment could accumulate live children without
   * limit. Asserting on the child's own exit state rather than on timing is what makes
   * that testable at all.
   */
  it('does not release the slot until the child has really exited, escalating past a trapped SIGTERM', async () => {
    const svc = makeService({ perProject: 1 });
    lastSpawnedChild = null;

    const result = await svc.runTest({
      ...occupyingRun('p1'),
      timeoutMs: 200,
      _hang: false,
      _testEnv: { FAKE_IGNORE_SIGTERM: '1' },
    });

    expect(result.error).toMatch(/timed out/i);
    const child = lastSpawnedChild as unknown as ChildProcess | null;
    expect(child).not.toBeNull();
    // Exactly the question the slot's meaning turns on: has this process ended?
    expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true);
  }, 15000);

  it('releases the slot when the request is rejected before any process is spawned', async () => {
    const svc = makeService({ perProject: 1 });

    await expect(svc.runTest({ ...quickRun('p1'), node: 'missing' })).rejects.toThrow(
      BadRequestException
    );
    expect(spawnCalls).toBe(0);

    const next = await svc.runTest(quickRun('p1'));
    expect(next.error).toBeNull();
    expect(spawnCalls).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // The cap itself.
  // ---------------------------------------------------------------------------

  it('never spawns more children than the per-project limit and refuses the excess', async () => {
    const svc = makeService({ perProject: 2 });

    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => svc.runTest(occupyingRun('p1')))
    );

    const accepted = settled.filter(r => r.status === 'fulfilled');
    const refused = settled.filter(r => r.status === 'rejected');
    expect(accepted).toHaveLength(2);
    expect(refused).toHaveLength(3);
    for (const r of refused) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConcurrencyLimitExceededException);
    }

    // The status can be right while the process cap leaks — assert the spawns.
    expect(spawnCalls).toBe(2);
    expect(maxLiveChildren).toBeLessThanOrEqual(2);
  }, 10000);

  it('refuses with the documented code and retry signal', async () => {
    const svc = makeService({ perProject: 1 });

    const running = svc.runTest(occupyingRun('p1'));
    const refusal = svc.runTest(occupyingRun('p1'));

    await expect(refusal).rejects.toBeInstanceOf(ConcurrencyLimitExceededException);
    await refusal.catch((e: ConcurrencyLimitExceededException) => {
      expect(e.code).toBe('CONNECTOR_TEST_CONCURRENCY_LIMIT');
      expect(e.message).toMatch(/already has 1 connector test running/i);
      expect(e.errorDetails).toEqual({
        scope: 'project',
        limit: 1,
        retryAfterSeconds: 20,
      });
    });

    await running;
  }, 10000);

  it('does not let one project starve another', async () => {
    const svc = makeService({ perProject: 1, total: 10 });

    const first = svc.runTest(occupyingRun('p1'));
    await expect(svc.runTest(occupyingRun('p1'))).rejects.toBeInstanceOf(
      ConcurrencyLimitExceededException
    );

    // A different project is unaffected by p1 holding its only slot.
    const other = svc.runTest(occupyingRun('p2'));

    await Promise.all([first, other]);
    expect(spawnCalls).toBe(2);
    expect(maxLiveChildren).toBeLessThanOrEqual(2);
  }, 10000);

  it('bounds the deployment total across projects, not just each project', async () => {
    const svc = makeService({ perProject: 5, total: 2 });

    const a = svc.runTest(occupyingRun('p1'));
    const b = svc.runTest(occupyingRun('p2'));
    const refusal = svc.runTest(occupyingRun('p3'));

    await expect(refusal).rejects.toBeInstanceOf(ConcurrencyLimitExceededException);
    await refusal.catch((e: ConcurrencyLimitExceededException) => {
      expect(e.errorDetails).toEqual({
        scope: 'deployment',
        limit: 2,
        retryAfterSeconds: 20,
      });
    });

    await Promise.all([a, b]);
    expect(spawnCalls).toBe(2);
    expect(maxLiveChildren).toBeLessThanOrEqual(2);
  }, 10000);

  it('falls back to a bounded default when no configuration is wired', async () => {
    // No ConfigService at all: the limit must still bind, not become unlimited.
    const svc = new ConnectorTestService();
    (svc as unknown as { runnerPath: () => string }).runnerPath = () => fakeRunner;

    const settled = await Promise.allSettled(
      Array.from({ length: 6 }, () => svc.runTest(occupyingRun('p1')))
    );

    expect(settled.filter(r => r.status === 'fulfilled')).toHaveLength(3);
    expect(settled.filter(r => r.status === 'rejected')).toHaveLength(3);
    expect(spawnCalls).toBe(3);
    expect(maxLiveChildren).toBeLessThanOrEqual(3);
  }, 10000);
});
