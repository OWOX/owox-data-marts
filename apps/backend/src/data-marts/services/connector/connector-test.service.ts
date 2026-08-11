import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChildProcess } from 'child_process';
import { spawn } from 'cross-spawn';

import { Core } from '@owox/connectors';
import { ConcurrencyLimitExceededException } from '../../../common/exceptions/concurrency-limit-exceeded.exception';
import { createCapturedLineBuffer, inheritConnectorEnv } from './connector-process-spawner.service';

/**
 * Synthetic field selected only to force a fields-less node to fetch, so the engine
 * still emits its raw SAMPLE for field discovery. The resulting cast rows are
 * meaningless (the node declares no fields) and are discarded before returning.
 */
const SAMPLE_ONLY_FIELD = '__owox_sample__';

/**
 * Wall-clock budget for one live test. Also the worst case a refused caller has to wait
 * for a slot, since a run cannot outlive it — which is what `retryAfterSeconds` reports.
 */
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * How many days of history one live test samples, ending today (UTC, inclusive).
 *
 * A node with an `incremental` block is walked ONE UPSTREAM REQUEST PER DAY
 * (AbstractConnector._processDayByDayNodes), over the window
 * `_getIncrementalStartDate` returns — and with no LastRequestedDate that default is the
 * 1st of the PREVIOUS month, i.e. 29-62 days. A test is a sample, not an import, so it
 * must not walk a backfill window: the only brakes were the row cap and the 20s budget,
 * and neither applies to the case Test exists to debug. A node returning 0 rows has no
 * row cap to hit, so it spent the whole budget on empty days and returned
 * "Test run timed out" INSTEAD of the 0-records diagnostic that names the likely cause.
 *
 * Two days rather than one: "today" is incomplete or empty on most reporting APIs, so a
 * one-day sample would report 0 records for a perfectly good connector and the
 * diagnostic would then blame recordPath — the misdiagnosis this whole path exists to
 * prevent. Yesterday is complete essentially everywhere, at a cost of 2 requests per
 * account instead of 59.
 */
export const TEST_DATE_WINDOW_DAYS = 2;

/** Fallbacks used when no ConfigService is wired; see env-validation.config.ts. */
const DEFAULT_MAX_TESTS_PER_PROJECT = 3;
const DEFAULT_MAX_TESTS_TOTAL = 10;

/**
 * Machine-readable marker on the refusal. The response is a 400 like every other
 * BusinessViolationException on this API, so the code is what lets a client tell a
 * transient "come back in a moment" apart from a permanently invalid request.
 */
export const CONNECTOR_TEST_CONCURRENCY_LIMIT_CODE = 'CONNECTOR_TEST_CONCURRENCY_LIMIT';

/**
 * How long a child gets to honour SIGTERM before SIGKILL, and again before the slot is
 * released regardless.
 *
 * A settled run must not hand its slot back while its child is still running — the cap
 * counts processes, so a slot that no longer corresponds to one is a slot that bounds
 * nothing. Short, because the result is already built by the time this is waited on: it
 * only delays the response for a child that ignores the signal, and a child that exits
 * normally is detected immediately.
 */
const CHILD_EXIT_GRACE_MS = 1000;

export interface ConnectorTestResult {
  rows: Record<string, unknown>[];
  logs: string[];
  error: string | null;
  sample: Record<string, unknown>[];
}

export interface ConnectorTestRequest {
  projectId: string;
  manifest: Record<string, unknown>;
  node: string;
  configuration: Record<string, unknown>;
  maxRows?: number;
  maxPages?: number;
  timeoutMs?: number;
  _hang?: boolean;
  /**
   * Test-only escape hatch: extra env entries merged into the (still
   * allow-listed) child env. Lets specs drive the `fake-test-runner.mjs`
   * fixture's `FAKE_*` toggles explicitly, without the production code ever
   * reading ambient `process.env` for them. Never populated outside tests.
   */
  _testEnv?: Record<string, string>;
}

@Injectable()
export class ConnectorTestService {
  /** Live tests currently holding a slot, keyed by project. Entries are deleted at zero. */
  private readonly activeTestsByProject = new Map<string, number>();
  /** Live tests currently holding a slot across every project on this instance. */
  private activeTestsTotal = 0;

  /**
   * `@Optional()` so the service stays constructible without a DI container — the specs
   * build it directly, and falling back to the constants above is the safe behaviour if
   * it is ever resolved outside the app context. It is never "no limit".
   */
  constructor(@Optional() private readonly configService?: ConfigService) {}

  /** Wrap a flat { name: value } config into the { name: { value } } shape AbstractContext expects. */
  wrapConfig(configuration: Record<string, unknown>): Record<string, { value: unknown }> {
    return Object.fromEntries(Object.entries(configuration).map(([k, v]) => [k, { value: v }]));
  }

  /** Reduce the manifest to a single node so the runner processes only that one. */
  pruneToNode(manifest: Record<string, unknown>, node: string): Record<string, unknown> {
    const nodes = (manifest.nodes ?? {}) as Record<string, unknown>;
    if (!nodes[node]) {
      throw new BadRequestException(`Unknown node "${node}"`);
    }
    return { ...manifest, nodes: { [node]: nodes[node] } };
  }

  /**
   * Build the `"node field, node field, ..."` selection that the connector's
   * `parseFields` expects, covering every declared field of the node. A live
   * test selects all of the node's fields (the data-mart UI supplies this on a
   * real run; the test panel has no field picker). Returns "" when the node
   * declares no fields.
   */
  selectNodeFields(manifest: Record<string, unknown>, node: string): string {
    const nodes = (manifest.nodes ?? {}) as Record<string, { fields?: Record<string, unknown> }>;
    const fields = nodes[node]?.fields ?? {};
    return Object.keys(fields)
      .map(f => `${node} ${f}`)
      .join(', ');
  }

  /**
   * Parse the WHOLE manifest to find the problem a single-node test would otherwise hide.
   * Returns the parser's message, or null when the whole manifest is publishable.
   *
   * A test prunes to one node, so the parse above only ever covers that node; publish()
   * parses everything. A two-node connector whose second node is malformed therefore passes
   * its test and is refused at publish -- and that is the ordinary shape of an
   * assistant-authored connector, where each node is written in turn and only the node just
   * written gets tested.
   *
   * Reported rather than thrown on purpose. The caller asked about ONE node and deserves an
   * answer about it: an author iterating on the first node while the second is half-written
   * would otherwise be locked out of testing anything, and a run that failed on a node it
   * never touched would be its own kind of unhelpful. The parser names the offending node
   * in its message, so the note is actionable without being an obstacle.
   */
  private findUntestedNodeError(manifest: Record<string, unknown>): string | null {
    try {
      new Core.ManifestParser().parse(JSON.stringify(manifest));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  protected runnerPath(): string {
    return require.resolve('@owox/connectors/runner');
  }

  /**
   * Terminate the test child and resolve once it has actually exited.
   *
   * SIGTERM first, SIGKILL after {@link CHILD_EXIT_GRACE_MS}, and resolve anyway after a
   * second grace period. That last step is deliberate: SIGKILL cannot be caught, so
   * reaching it means the process is wedged in a way no further signal fixes, and holding
   * the slot forever would turn a stuck child into a permanently smaller cap — a worse
   * failure than the one being guarded against.
   */
  private stopChild(child: ChildProcess): Promise<void> {
    // Nothing to wait for: no process was ever created (a failed spawn, which reaches
    // `finish` through the `error` handler), or it has already been reaped — the `close`
    // path, and the common case.
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        clearTimeout(killTimer);
        clearTimeout(giveUpTimer);
        resolve();
      };

      child.once('close', settle);
      // A spawn that failed never produces `close`; without this the wait would run to
      // the give-up timer for a child that never existed.
      child.once('error', settle);

      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, CHILD_EXIT_GRACE_MS);
      const giveUpTimer = setTimeout(settle, CHILD_EXIT_GRACE_MS * 2);

      try {
        child.kill('SIGTERM');
      } catch {
        settle();
      }
    });
  }

  /**
   * The bounded window a live test samples, as the engine formats dates (UTC YYYY-MM-DD).
   *
   * `end` is today because that is what `_getIncrementalDateRange` uses as its end and
   * nothing can move it; `start` is the value fed to the engine as LastRequestedDate.
   */
  private testDateWindow(): { start: string; end: string } {
    const todayMs = Date.now();
    return {
      start: new Date(todayMs - (TEST_DATE_WINDOW_DAYS - 1) * 86400000).toISOString().split('T')[0],
      end: new Date(todayMs).toISOString().split('T')[0],
    };
  }

  /**
   * Read one concurrency limit, never trusting it to disable the cap: a missing, blank or
   * nonsensical value falls back to the constant rather than to "unbounded".
   */
  private limit(key: string, fallback: number): number {
    const configured = Number(this.configService?.get(key, fallback) ?? fallback);
    return Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : fallback;
  }

  /**
   * Reserve one live-test slot for `projectId`, or refuse. Returns the release callback.
   *
   * Bounds spawned CHILD PROCESSES rather than request rate, because that is what the
   * endpoint actually costs: one `node` process holding a slot for up to 20s while it
   * drives up to 50 pages of outbound HTTP at a host the manifest author chose. Rate
   * limiting the route would leave a slow caller free to keep any number of them alive at
   * once, and would not cover the MCP `connector_test` tool, which reaches `runTest`
   * without passing through the HTTP route at all.
   *
   * Refusal is immediate; there is no queue. `data-marts.module.ts` deliberately excludes
   * this route from the 30s operation timeout, so a waiting request has no server-side
   * deadline: it would hold a connection until the client gives up and could still take a
   * slot afterwards, spawning a process nobody is waiting for. Saying so now is honest.
   */
  private acquireTestSlot(projectId: string): () => void {
    const perProject = this.limit('MAX_CONNECTOR_TESTS_PER_PROJECT', DEFAULT_MAX_TESTS_PER_PROJECT);
    const total = this.limit('MAX_CONNECTOR_TESTS_TOTAL', DEFAULT_MAX_TESTS_TOTAL);
    const retryAfterSeconds = Math.ceil(DEFAULT_TIMEOUT_MS / 1000);
    const active = this.activeTestsByProject.get(projectId) ?? 0;

    // Per-project first: when a project saturates both caps, the message it can act on is
    // the one about its own tests, not about the deployment.
    if (active >= perProject) {
      throw new ConcurrencyLimitExceededException(
        `This project already has ${perProject} connector test${perProject === 1 ? '' : 's'} running. ` +
          `Wait for one to finish, then try again.`,
        { scope: 'project', limit: perProject, retryAfterSeconds },
        CONNECTOR_TEST_CONCURRENCY_LIMIT_CODE
      );
    }
    if (this.activeTestsTotal >= total) {
      throw new ConcurrencyLimitExceededException(
        `This deployment already has ${total} connector tests running. Try again in a moment.`,
        { scope: 'deployment', limit: total, retryAfterSeconds },
        CONNECTOR_TEST_CONCURRENCY_LIMIT_CODE
      );
    }

    this.activeTestsByProject.set(projectId, active + 1);
    this.activeTestsTotal += 1;

    let released = false;
    return () => {
      // Idempotent: releasing twice would hand out a slot that was never taken.
      if (released) return;
      released = true;
      this.activeTestsTotal -= 1;
      const remaining = (this.activeTestsByProject.get(projectId) ?? 1) - 1;
      if (remaining > 0) this.activeTestsByProject.set(projectId, remaining);
      else this.activeTestsByProject.delete(projectId);
    };
  }

  async runTest(args: ConnectorTestRequest): Promise<ConnectorTestResult> {
    const release = this.acquireTestSlot(args.projectId);
    try {
      // Awaited, not returned directly: `finally` runs when the returned promise is
      // CREATED, not when it settles, so dropping this await would free the slot while
      // the child process is still running and make the cap meaningless.
      const result = await this.execute(args);
      return result;
    } finally {
      release();
    }
  }

  private async execute(args: ConnectorTestRequest): Promise<ConnectorTestResult> {
    const maxRows = args.maxRows ?? 25;
    const maxPages = args.maxPages ?? 1;
    // Default below the web client's 30s axios timeout so the backend responds
    // first with a clear "timed out" result instead of the web giving up generically.
    const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const pruned = this.pruneToNode(args.manifest, args.node);
    try {
      new Core.ManifestParser().parse(JSON.stringify(pruned));
    } catch (e) {
      throw new BadRequestException(
        `Invalid manifest: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    // The pruned manifest is the full one minus the other nodes, so it having parsed means
    // anything the full manifest trips on is in a node this run does not touch.
    const untestedNodeError = this.findUntestedNodeError(args.manifest);

    // The connector only fetches nodes selected via the `Fields` config param
    // (`"node field, ..."`). On a real run the data-mart UI supplies it; the live
    // test panel has no field picker, so select every declared field of the node.
    const sourceConfig: Record<string, { value: unknown }> = this.wrapConfig(args.configuration);
    // A node is only fetched if it appears in the `Fields` selection (see the
    // connector's parseFields). The test panel has no field picker, so we select
    // every declared field. When the node declares none, that selection is empty and
    // the connector would skip the node entirely — no HTTP, no sample — leaving the
    // author unable to discover the API shape. Select a synthetic field purely to
    // force the fetch: the engine still emits the raw SAMPLE (pre-projection), which
    // is what discovery needs. The cast rows are meaningless in that mode, so they are
    // blanked when the result is resolved below.
    let sampleOnly = false;
    if (sourceConfig.Fields === undefined) {
      const fieldsSelection = this.selectNodeFields(pruned, args.node);
      if (fieldsSelection) {
        sourceConfig.Fields = { value: fieldsSelection };
      } else {
        sampleOnly = true;
        sourceConfig.Fields = { value: `${args.node} ${SAMPLE_ONLY_FIELD}` };
      }
    }

    // Clamp the incremental window to a sample (see TEST_DATE_WINDOW_DAYS). These are
    // the only two values `_getIncrementalStartDate` reads, so setting both is what
    // makes the bound a bound:
    //   startDate = LastRequestedDate - ReimportLookbackWindow, endDate = today.
    // Set AFTER wrapConfig on purpose — they overwrite whatever the caller supplied. A
    // configuration that could widen the window would reinstate the walk, and
    // ReimportLookbackWindow is not even the author's to withhold: ManifestParser
    // injects it (default 2) into every declarative manifest that omits it. Written
    // unconditionally rather than only for a time-series node because the engine reads
    // them ONLY on that path, and the predicate that decides it deliberately lives in
    // one place inside the engine (Core/Declarative/timeSeries.js) — copying it here is
    // exactly the drift that file exists to prevent.
    const dateWindow = this.testDateWindow();
    sourceConfig.LastRequestedDate = { value: dateWindow.start };
    sourceConfig.ReimportLookbackWindow = { value: 0 };

    // Allow-list only what the spawned runner genuinely needs. Never spread
    // `...process.env` here — the parent (backend) process env may carry
    // secrets (API keys, DB credentials, etc.) that a project editor's
    // arbitrary manifest/config should never be able to read or exfiltrate
    // via the connector-test child process. The list is shared with
    // ConnectorProcessSpawnerService, which applies it to production runs of the
    // same user-authored manifests; note the test child deliberately does NOT
    // inherit OW_ALLOW_LOCAL_EGRESS, so a live test can never reach a private host.
    const env: Record<string, string | undefined> = {
      ...inheritConnectorEnv(),
      OW_DATAMART_ID: 'test',
      OW_RUN_ID: 'test',
      OW_TEST: '1',
      OW_TEST_MAX_ROWS: String(maxRows),
      OW_TEST_MAX_PAGES: String(maxPages),
      OW_MANIFEST: JSON.stringify(pruned),
      OW_CONFIG: JSON.stringify({
        source: { name: String(args.manifest.name ?? 'Custom'), config: sourceConfig },
        storage: { name: 'LiveTest', config: {} },
      }),
      OW_RUN_CONFIG: JSON.stringify({ type: 'INCREMENTAL', data: [], state: {} }),
    };
    if (args._hang) env.FAKE_HANG = '1';
    if (args._testEnv) Object.assign(env, args._testEnv);

    const marker: string = Core.TEST_ROW_MARKER;
    const rows: Record<string, unknown>[] = [];
    const logs: string[] = [];
    const errorLogs: string[] = [];
    let sample: Record<string, unknown>[] = [];

    return new Promise<ConnectorTestResult>(resolve => {
      const child = spawn('node', ['--no-deprecation', this.runnerPath()], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let settled = false;
      const finish = (error: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // A partial stderr line is still diagnostic on the paths that settle without
        // waiting for `close` (timeout, maxRows reached). Safe to flush here because a
        // stderr line only appends to `logs` — it can never re-enter `finish`, which
        // flushing the stdout buffer could.
        stderrBuffer.flush();
        const captured = rows.slice(0, maxRows);
        // The engine can log an error (e.g. a per-account auth 401) yet still
        // exit 0 and "complete" the run. With no rows to show, that would read
        // as a misleading "success, 0 rows". If something was logged at error
        // level and we got no data, the test failed — surface the cause.
        if (error === null && captured.length === 0 && errorLogs.length > 0) {
          error = errorLogs[0];
        }
        // A run that "succeeds" but yields 0 rows is the most common silent
        // connector bug (usually a wrong recordPath/path/filter). The request
        // and process logs look healthy, so neither a human reading the test
        // panel nor the Build-with-AI "Fix" flow (which is fed these logs) can
        // tell anything is wrong. Surface it explicitly.
        if (error === null && captured.length === 0) {
          logs.push(
            `Test produced 0 records: the request completed without error but recordSelector.recordPath matched no rows.` +
              (sample.length > 0
                ? ` A raw response sample WAS received (${sample.length} record(s)), so recordPath is the likely culprit — compare it against the sample shape.`
                : ` Check recordPath, the request path/queryParameters, and any filters.`) +
              // The clamp above creates a second way to read 0 records, and it is not a
              // defect: a date-partitioned node whose sampled days genuinely hold no data.
              // Naming the window keeps the recordPath advice from being read as the only
              // explanation — by a human, and by the Build-with-AI fix flow these logs feed.
              ` If this node is fetched by date, note that a live test samples only ` +
              `${dateWindow.start} to ${dateWindow.end}; a window with no data upstream ` +
              `returns 0 records too.`
          );
        }
        // Last, so it survives the MCP boundary: boundTestLogsForMcp keeps the NEWEST
        // entries, and this is the one piece of news a passing test cannot otherwise carry.
        if (untestedNodeError) {
          logs.push(
            `This test ran only the node "${args.node}". Publishing validates every node, and ` +
              `another node in this manifest cannot be published: ${untestedNodeError}`
          );
        }
        // In sample-only mode the cast rows are meaningless (no declared fields); the
        // raw `sample` is the payload. `captured` is left intact above so the 0-record
        // diagnostic still keys off the genuine record count.
        const result: ConnectorTestResult = {
          rows: sampleOnly ? [] : captured,
          logs,
          error,
          sample,
        };
        // Resolve only once the child is gone. `runTest` releases the concurrency slot
        // when this promise settles, and that slot bounds child PROCESSES — releasing it
        // while one is still running makes the cap count something that no longer exists.
        void this.stopChild(child).then(() => resolve(result));
      };
      const timer = setTimeout(() => finish(`Test run timed out after ${timeoutMs}ms`), timeoutMs);

      const onLine = (line: string) => {
        if (!line) return;
        if (line.startsWith(marker)) {
          try {
            rows.push(JSON.parse(line.slice(marker.length)) as Record<string, unknown>);
          } catch {
            /* malformed */
          }
          if (rows.length >= maxRows) finish(null);
          return;
        }
        try {
          const evt = JSON.parse(line) as {
            type?: string;
            level?: string;
            message?: string;
            records?: Record<string, unknown>[];
          };
          if (evt && evt.type === 'SAMPLE') {
            // engine emits at most one SAMPLE event per run; if more arrive, last wins
            sample = Array.isArray(evt.records) ? evt.records : [];
            return;
          }
          // Track engine-level errors (e.g. a per-account auth 401): the run may
          // still exit 0, so we need this to mark the test failed below.
          if (
            evt &&
            evt.type === 'LOG' &&
            evt.level === 'error' &&
            typeof evt.message === 'string'
          ) {
            errorLogs.push(evt.message);
          }
        } catch {
          /* not JSON — fall through to logs */
        }
        logs.push(line);
      };
      // Reassemble lines through the SAME bounded buffer a production connector run
      // uses. A manifest echoes payloads from an API we do not control, so a single
      // newline-free line can be arbitrarily large; without the bound each live test
      // could grow the heap by that line, and up to MAX_CONNECTOR_TESTS_TOTAL of them
      // run at once. Over the cap the buffer emits a truncation notice and drops the
      // rest of that line, leaving later output intact.
      const stdoutBuffer = createCapturedLineBuffer(onLine);
      const stderrBuffer = createCapturedLineBuffer(line => {
        // Blank lines carry nothing; `onLine` drops them on the stdout side too.
        if (line) logs.push(line);
      });
      child.stdout?.on('data', (chunk: Buffer) => stdoutBuffer.push(chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => stderrBuffer.push(chunk.toString()));
      child.on('close', code => {
        if (settled) return;
        stdoutBuffer.flush();
        stderrBuffer.flush();
        finish(
          code === 0 || rows.length > 0 ? null : `Test process exited with code ${String(code)}`
        );
      });
      child.on('error', err => finish(err.message));
    });
  }
}
