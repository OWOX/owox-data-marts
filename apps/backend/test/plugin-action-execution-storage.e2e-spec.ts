import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestApp } from '@owox/test-utils';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { TriggerStatus } from 'src/common/scheduler/shared/entities/trigger-status';
import { PluginActionExecution } from 'src/plugin-host/entities/plugin-action-execution.entity';
import { PluginActionSchedule } from 'src/plugin-host/entities/plugin-action-schedule.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginActionExecutionStatus } from 'src/plugin-host/enums/plugin-action-execution-status.enum';
import type { PluginRunCursor, PluginRunFilter } from 'src/plugin-host/dto/domain/plugin-run.dto';
import {
  InstallationInactiveError,
  TooManyExecutionsError,
} from 'src/plugin-host/errors/plugin-action.errors';
import {
  InsertRunningExecutionInput,
  InsertScheduledExecutionInput,
  PluginActionExecutionService,
} from 'src/plugin-host/services/plugin-action-execution.service';
import { createExecutionToken } from 'src/plugin-host/utils/execution-token.util';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('Plugin action execution storage (e2e)', () => {
  let app: INestApplication;
  let service: PluginActionExecutionService;
  let executions: Repository<PluginActionExecution>;
  let schedules: Repository<PluginActionSchedule>;
  let repoCounter = 870_000;

  beforeAll(async () => {
    app = (await createTestApp()).app;
    service = app.get(PluginActionExecutionService);
    executions = app.get(getRepositoryToken(PluginActionExecution));
    schedules = app.get(getRepositoryToken(PluginActionSchedule));
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  async function installation(options: { uninstalled?: boolean } = {}) {
    const plugins = app.get<Repository<Plugin>>(getRepositoryToken(Plugin));
    const installations = app.get<Repository<PluginInstallation>>(
      getRepositoryToken(PluginInstallation)
    );
    repoCounter += 1;
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: String(repoCounter),
        repoOwner: 'OWOX',
        repoName: `actions-${repoCounter}`,
        repoHtmlUrl: `https://github.com/OWOX/actions-${repoCounter}`,
      } as Partial<Plugin>)
    );
    return installations.save(
      installations.create({
        pluginId: plugin.id,
        projectId: 'project-1',
        userId: 'user-1',
        installedAt: new Date(),
        uninstalledAt: options.uninstalled ? new Date() : null,
      })
    );
  }

  function running(
    target: PluginInstallation,
    overrides: Partial<InsertRunningExecutionInput> = {}
  ): InsertRunningExecutionInput {
    return {
      pluginId: target.pluginId,
      pluginVersionId: randomUUID(),
      installationId: target.id,
      projectId: target.projectId,
      userId: target.userId,
      action: 'update-document',
      input: { documentId: 'd1' },
      inputBytes: Buffer.byteLength('{"documentId":"d1"}'),
      role: 'editor',
      timeoutSeconds: 60,
      tokenHash: createExecutionToken().tokenHash,
      trigger: 'frontend',
      ...overrides,
    };
  }

  // Paused, so no scheduler run picks it up; PROCESSING, as the runner holds it during a start.
  function schedule(target: PluginInstallation): Promise<PluginActionSchedule> {
    return schedules.save(
      schedules.create({
        pluginId: target.pluginId,
        installationId: target.id,
        projectId: target.projectId,
        action: 'update-document',
        parameters: { documentId: 'd1' },
        name: null,
        cronExpression: '0 9 * * *',
        timeZone: 'UTC',
        status: TriggerStatus.PROCESSING,
        isActive: false,
        nextRunTimestamp: null,
        lastRunTimestamp: null,
        disabledReason: null,
        lastExecutionId: null,
      })
    );
  }

  function scheduled(
    target: PluginInstallation,
    plan: PluginActionSchedule
  ): InsertScheduledExecutionInput {
    const { trigger: _frontend, ...request } = running(target);
    return { ...request, scheduleId: plan.id, scheduleVersion: plan.version };
  }

  function promotion(execution: PluginActionExecution, tokenHash: string) {
    return {
      id: execution.id,
      installationId: execution.installationId,
      pluginVersionId: randomUUID(),
      role: 'viewer',
      tokenHash,
      timeoutSeconds: 30,
    };
  }

  it('stores a RUNNING execution with its input and deadline', async () => {
    const target = await installation();

    const before = Date.now();
    const saved = await service.insertRunning(running(target, { timeoutSeconds: 30 }));
    const after = Date.now();

    const loaded = await executions.findOneByOrFail({ id: saved.id });
    expect(loaded).toMatchObject({
      status: PluginActionExecutionStatus.RUNNING,
      input: { documentId: 'd1' },
      role: 'editor',
      trigger: 'frontend',
      finishedAt: null,
      errorCode: null,
      result: null,
    });
    // Whole seconds, and never less than the timeout after the real start.
    expect(loaded.startedAt!.getMilliseconds()).toBe(0);
    expect(loaded.deadlineAt!.getMilliseconds()).toBe(0);
    expect(loaded.deadlineAt!.getTime()).toBeGreaterThanOrEqual(before + 30_000);
    expect(loaded.deadlineAt!.getTime()).toBeLessThan(after + 31_000);
  });

  it('does not let a RUNNING row past its deadline hold a slot', async () => {
    const target = await installation();
    const stale = await service.insertRunning(running(target));
    await executions.update(stale.id, { deadlineAt: new Date(Date.now() - 1000) });
    for (let i = 0; i < 4; i += 1) {
      await service.insertRunning(running(target));
    }

    await expect(service.insertRunning(running(target))).resolves.toMatchObject({
      status: PluginActionExecutionStatus.RUNNING,
    });
    await expect(service.insertRunning(running(target))).rejects.toBeInstanceOf(
      TooManyExecutionsError
    );
  });

  it('refuses the sixth running execution and frees the slot when one finishes', async () => {
    const target = await installation();
    const first = await service.insertRunning(running(target));
    for (let i = 0; i < 4; i += 1) {
      await service.insertRunning(running(target));
    }

    await expect(service.insertRunning(running(target))).rejects.toBeInstanceOf(
      TooManyExecutionsError
    );
    expect(await executions.countBy({ installationId: target.id })).toBe(5);

    await service.finish(first.id, { status: PluginActionExecutionStatus.SUCCEEDED, result: null });
    await expect(service.insertRunning(running(target))).resolves.toMatchObject({
      status: PluginActionExecutionStatus.RUNNING,
    });
  });

  it('lets exactly five of seven concurrent starts win', async () => {
    const target = await installation();

    const results = await Promise.allSettled(
      Array.from({ length: 7 }, () => service.insertRunning(running(target)))
    );

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5);
    const refusals = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    expect(refusals.map(result => result.reason)).toEqual([
      expect.any(TooManyExecutionsError),
      expect.any(TooManyExecutionsError),
    ]);
    expect(
      await executions.countBy({
        installationId: target.id,
        status: PluginActionExecutionStatus.RUNNING,
      })
    ).toBe(5);
  });

  it('refuses starts past the per-minute limit, even when each earlier one was cancelled', async () => {
    const target = await installation();
    for (let i = 0; i < 60; i += 1) {
      const row = await service.insertRunning(running(target));
      await service.cancel(row.id, target.id);
    }

    await expect(service.insertRunning(running(target))).rejects.toThrow(
      '60 starts per minute reached'
    );
    await executions.update(
      { installationId: target.id },
      { startedAt: new Date(Date.now() - 2 * 60_000) }
    );
    await expect(service.insertRunning(running(target))).resolves.toBeDefined();
  });

  it('counts a queued run cancelled before it started toward the limits, a live one not', async () => {
    const target = await installation();
    const plan = await schedule(target);
    const started: PluginActionExecution[] = [];
    for (let i = 0; i < 5; i += 1) {
      started.push(await service.insertRunning(running(target)));
    }
    await expect(service.insertScheduled(scheduled(target, plan))).resolves.toMatchObject({
      queued: true,
    });
    for (const row of started) {
      await service.cancel(row.id, target.id);
    }
    for (let i = started.length; i < 59; i += 1) {
      const row = await service.insertRunning(running(target));
      await service.cancel(row.id, target.id);
    }

    await expect(service.assertWithinStartLimits(target.id, Date.now())).resolves.toBeUndefined();
    await expect(service.cancelQueuedForSchedule(plan.id)).resolves.toBe(1);
    await expect(service.assertWithinStartLimits(target.id, Date.now())).rejects.toBeInstanceOf(
      TooManyExecutionsError
    );
  });

  it('counts the payload of a run timed out in the queue, and of a started one once', async () => {
    const target = await installation();
    const plan = await schedule(target);
    const promoted = await service.insertRunning(running(target));
    // Queued, then promoted: both timestamps are set, and the started sum alone may count it.
    await executions.update(promoted.id, {
      status: PluginActionExecutionStatus.TIMED_OUT,
      queuedAt: new Date(Date.now() - 2 * HOUR),
      finishedAt: new Date(),
      payloadBytes: 60 * 1024 * 1024,
    });
    await expect(service.assertWithinStartLimits(target.id, Date.now())).resolves.toBeUndefined();

    for (let i = 0; i < 5; i += 1) {
      await service.insertRunning(running(target));
    }
    const { execution: waiting } = await service.insertScheduled(scheduled(target, plan));
    await executions.update(waiting.id, {
      queuedAt: new Date(Date.now() - 25 * HOUR),
      payloadBytes: 40 * 1024 * 1024,
    });
    await service.timeOutQueued(new Date(Date.now() - 24 * HOUR));

    await expect(service.findStatus(waiting.id)).resolves.toBe(
      PluginActionExecutionStatus.TIMED_OUT
    );
    await expect(service.assertWithinStartLimits(target.id, Date.now())).rejects.toThrow(
      '100 MiB of stored payloads reached'
    );
  });

  it('counts payloadBytes only within 48 hours of the start', async () => {
    const target = await installation();
    const saved = await service.insertRunning(running(target));
    await service.finish(saved.id, { status: PluginActionExecutionStatus.SUCCEEDED, result: 'é' });
    expect((await executions.findOneByOrFail({ id: saved.id })).payloadBytes).toBe(
      Buffer.byteLength('{"documentId":"d1"}') + 4
    );

    await executions.update(saved.id, { payloadBytes: 100 * 1024 * 1024 });
    await expect(service.insertRunning(running(target))).rejects.toThrow(
      '100 MiB of stored payloads reached'
    );
    await executions.update(saved.id, { startedAt: new Date(Date.now() - 49 * HOUR) });
    await expect(service.insertRunning(running(target))).resolves.toBeDefined();
  });

  it('refuses an uninstalled installation and writes no row', async () => {
    const target = await installation({ uninstalled: true });

    await expect(service.insertRunning(running(target))).rejects.toBeInstanceOf(
      InstallationInactiveError
    );
    expect(await executions.countBy({ installationId: target.id })).toBe(0);
  });

  it('finishes only from RUNNING, so a late answer cannot overwrite the first outcome', async () => {
    const target = await installation();
    const saved = await service.insertRunning(running(target));

    await expect(
      service.finish(saved.id, { status: PluginActionExecutionStatus.SUCCEEDED, result: 'done' })
    ).resolves.toBe(true);
    await expect(
      service.finish(saved.id, {
        status: PluginActionExecutionStatus.TIMED_OUT,
        errorMessage: 'late',
      })
    ).resolves.toBe(false);
    await expect(service.cancel(saved.id, target.id)).resolves.toBe(false);

    await expect(executions.findOneByOrFail({ id: saved.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.SUCCEEDED,
      result: 'done',
      errorMessage: null,
      finishedAt: expect.any(Date),
    });
  });

  it('stores a FAILED outcome with the plugin code and message', async () => {
    const target = await installation();
    const saved = await service.insertRunning(running(target));

    await service.finish(saved.id, {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'DOC_LOCKED',
      errorMessage: 'Document is locked',
    });

    await expect(executions.findOneByOrFail({ id: saved.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'DOC_LOCKED',
      errorMessage: 'Document is locked',
      result: null,
    });
  });

  it('cancels only for the installation that owns the execution', async () => {
    const owner = await installation();
    const stranger = await installation();
    const saved = await service.insertRunning(running(owner));

    await expect(service.cancel(saved.id, stranger.id)).resolves.toBe(false);
    await expect(service.findStatus(saved.id)).resolves.toBe(PluginActionExecutionStatus.RUNNING);

    await expect(service.cancel(saved.id, owner.id)).resolves.toBe(true);
    await expect(service.findStatus(saved.id)).resolves.toBe(PluginActionExecutionStatus.CANCELLED);
  });

  it('finds a running execution by token hash until it ends or passes its deadline', async () => {
    const target = await installation();
    const { tokenHash } = createExecutionToken();
    const saved = await service.insertRunning(running(target, { tokenHash }));

    await expect(service.findRunningByTokenHash(tokenHash, new Date())).resolves.toMatchObject({
      id: saved.id,
    });
    await expect(
      service.findRunningByTokenHash(tokenHash, new Date(Date.now() + 61_000))
    ).resolves.toBeNull();

    await service.cancel(saved.id, target.id);
    await expect(service.findRunningByTokenHash(tokenHash, new Date())).resolves.toBeNull();
  });

  it('answers null for the status of an unknown execution', async () => {
    await expect(service.findStatus(randomUUID())).resolves.toBeNull();
    await expect(service.findById(randomUUID())).resolves.toBeNull();
  });

  it('times out orphans, clears old payloads and deletes old rows, each once', async () => {
    const target = await installation();
    const orphan = await service.insertRunning(running(target));
    await executions.update(orphan.id, { deadlineAt: new Date(Date.now() - 2 * 60_000) });
    const fresh = await service.insertRunning(running(target));
    const yesterday = await service.insertRunning(running(target));
    await service.finish(yesterday.id, {
      status: PluginActionExecutionStatus.SUCCEEDED,
      result: { rows: 3 },
    });
    await executions.update(yesterday.id, {
      finishedAt: new Date(Date.now() - 25 * HOUR),
      deadlineAt: new Date(Date.now() - 25 * HOUR),
    });
    const ancient = await service.insertRunning(running(target));
    await service.finish(ancient.id, {
      status: PluginActionExecutionStatus.SUCCEEDED,
      result: null,
    });
    await executions.update(ancient.id, { finishedAt: new Date(Date.now() - 91 * DAY) });
    const failed = async (errorCode: string) => {
      const row = await service.insertRunning(running(target));
      await service.finish(row.id, {
        status: PluginActionExecutionStatus.FAILED,
        errorCode,
        errorMessage: 'May echo the input',
      });
      await executions.update(row.id, { finishedAt: new Date(Date.now() - 25 * HOUR) });
      return row;
    };
    const pluginFailure = await failed('DOC_LOCKED');
    const owoxFailure = await failed('BACKEND_UNREACHABLE');

    expect(await service.timeOutOrphans(new Date(Date.now() - 60_000))).toBe(1);
    expect(await service.clearPayloads(new Date(Date.now() - 24 * HOUR))).toBe(4);
    expect(await service.clearPayloads(new Date(Date.now() - 24 * HOUR))).toBe(0);
    expect(await service.deleteFinished(new Date(Date.now() - 90 * DAY))).toBe(1);

    await expect(executions.findOneByOrFail({ id: pluginFailure.id })).resolves.toMatchObject({
      errorCode: 'DOC_LOCKED',
      errorMessage: null,
      input: null,
      payloadsClearedAt: expect.any(Date),
    });
    await expect(executions.findOneByOrFail({ id: owoxFailure.id })).resolves.toMatchObject({
      errorCode: 'BACKEND_UNREACHABLE',
      errorMessage: 'May echo the input',
      input: null,
      payloadBytes: 0,
    });

    await expect(executions.findOneByOrFail({ id: orphan.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.TIMED_OUT,
      errorCode: null,
      errorMessage: expect.any(String),
      finishedAt: expect.any(Date),
    });
    await expect(service.findStatus(fresh.id)).resolves.toBe(PluginActionExecutionStatus.RUNNING);
    await expect(executions.findOneByOrFail({ id: fresh.id })).resolves.toMatchObject({
      input: { documentId: 'd1' },
      payloadsClearedAt: null,
      payloadBytes: 19,
    });
    await expect(executions.findOneByOrFail({ id: yesterday.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.SUCCEEDED,
      input: null,
      result: null,
    });
    await expect(service.findById(ancient.id)).resolves.toBeNull();
  });

  it('queues a scheduled run at five RUNNING and points the schedule at it', async () => {
    const target = await installation();
    const plan = await schedule(target);
    for (let i = 0; i < 5; i += 1) {
      await service.insertRunning(running(target));
    }

    const { execution, queued } = await service.insertScheduled(scheduled(target, plan));

    expect(queued).toBe(true);
    await expect(executions.findOneByOrFail({ id: execution.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.QUEUED,
      trigger: 'schedule',
      scheduleId: plan.id,
      tokenHash: null,
      startedAt: null,
      deadlineAt: null,
      queuedAt: expect.any(Date),
      input: { documentId: 'd1' },
      payloadBytes: Buffer.byteLength('{"documentId":"d1"}'),
    });
    await expect(schedules.findOneByOrFail({ id: plan.id })).resolves.toMatchObject({
      lastExecutionId: execution.id,
      version: plan.version,
    });
    await expect(service.hasOpenForSchedule(plan.id)).resolves.toBe(true);
    await expect(service.findOldestQueued(target.id)).resolves.toMatchObject({ id: execution.id });
    await expect(service.findInstallationsWithQueued(500)).resolves.toContain(target.id);
    await expect(
      service.promote(promotion(execution, createExecutionToken().tokenHash))
    ).resolves.toEqual({ outcome: 'WAIT' });

    await expect(service.cancel(execution.id, target.id)).resolves.toBe(true);
    await expect(service.findStatus(execution.id)).resolves.toBe(
      PluginActionExecutionStatus.CANCELLED
    );
    await expect(service.hasOpenForSchedule(plan.id)).resolves.toBe(false);
    await expect(service.findInstallationsWithQueued(500)).resolves.not.toContain(target.id);
  });

  it('pages the installations with a queued run one by one, each once, in id order', async () => {
    const targets = [await installation(), await installation(), await installation()];
    for (const target of targets) {
      const plan = await schedule(target);
      for (let i = 0; i < 5; i += 1) {
        await service.insertRunning(running(target));
      }
      // Two queued rows on one installation: DISTINCT must still return it once.
      await service.insertScheduled(scheduled(target, plan));
      await service.insertScheduled(scheduled(target, plan));
    }

    const seen: string[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await service.findInstallationsWithQueued(1, after);
      if (page.length === 0) {
        break;
      }
      expect(page).toHaveLength(1);
      seen.push(page[0]);
      after = page[0];
    }

    expect(seen).toEqual([...new Set(seen)].sort());
    expect(seen.filter(id => targets.some(target => target.id === id))).toEqual(
      targets.map(target => target.id).sort()
    );
    await expect(service.findInstallationsWithQueued(1, seen[seen.length - 1])).resolves.toEqual(
      []
    );
  });

  it('lets five of seven concurrent scheduled runs start and queues the other two', async () => {
    const target = await installation();
    const plan = await schedule(target);

    const results = await Promise.all(
      Array.from({ length: 7 }, () => service.insertScheduled(scheduled(target, plan)))
    );

    expect(results.filter(result => !result.queued)).toHaveLength(5);
    expect(results.filter(result => result.queued)).toHaveLength(2);
    expect(
      await executions.countBy({
        installationId: target.id,
        status: PluginActionExecutionStatus.RUNNING,
      })
    ).toBe(5);
    expect(
      await executions.countBy({
        installationId: target.id,
        status: PluginActionExecutionStatus.QUEUED,
      })
    ).toBe(2);
  });

  it('starts a queued run once when two promoters race for it', async () => {
    const target = await installation();
    const plan = await schedule(target);
    const started: PluginActionExecution[] = [];
    for (let i = 0; i < 5; i += 1) {
      started.push(await service.insertRunning(running(target)));
    }
    const { execution } = await service.insertScheduled(scheduled(target, plan));
    for (const row of started.slice(0, 2)) {
      await service.finish(row.id, { status: PluginActionExecutionStatus.SUCCEEDED, result: null });
    }
    const tokens = [createExecutionToken().tokenHash, createExecutionToken().tokenHash];

    const outcomes = await Promise.all(
      tokens.map(tokenHash => service.promote(promotion(execution, tokenHash)))
    );

    expect(outcomes.map(result => result.outcome).sort()).toEqual(['GONE', 'STARTED']);
    const loaded = await executions.findOneByOrFail({ id: execution.id });
    expect(loaded).toMatchObject({
      status: PluginActionExecutionStatus.RUNNING,
      role: 'viewer',
      queuedAt: expect.any(Date),
    });
    expect(tokens).toContain(loaded.tokenHash);
    expect(loaded.startedAt!.getMilliseconds()).toBe(0);
    expect(loaded.deadlineAt!.getTime()).toBeGreaterThanOrEqual(
      loaded.startedAt!.getTime() + 30_000
    );
    expect(outcomes.find(result => result.outcome === 'STARTED')).toMatchObject({
      execution: { id: execution.id, tokenHash: loaded.tokenHash },
    });
    expect(
      await executions.countBy({
        installationId: target.id,
        status: PluginActionExecutionStatus.RUNNING,
      })
    ).toBe(4);
  });

  it("cancels a schedule's queued run and leaves its running one", async () => {
    const target = await installation();
    const plan = await schedule(target);
    const { execution: runningRun } = await service.insertScheduled(scheduled(target, plan));
    for (let i = 0; i < 4; i += 1) {
      await service.insertRunning(running(target));
    }
    const { execution: queuedRun, queued } = await service.insertScheduled(scheduled(target, plan));
    expect(queued).toBe(true);

    await expect(service.cancelQueuedForSchedule(plan.id)).resolves.toBe(1);

    const lastRuns = await service.findLastRuns([runningRun.id, queuedRun.id, randomUUID()]);
    expect(lastRuns).toHaveLength(2);
    expect(lastRuns).toEqual(
      expect.arrayContaining([
        {
          id: runningRun.id,
          status: PluginActionExecutionStatus.RUNNING,
          errorCode: null,
          finishedAt: null,
        },
        {
          id: queuedRun.id,
          status: PluginActionExecutionStatus.CANCELLED,
          errorCode: null,
          finishedAt: expect.any(Date),
        },
      ])
    );
    await expect(service.findById(queuedRun.id)).resolves.toMatchObject({
      scheduleId: plan.id,
      errorMessage: 'The schedule was changed, paused or deleted',
    });
    await expect(service.failQueued(queuedRun.id, 'OWNER_NOT_MEMBER', 'late')).resolves.toBe(false);
    await expect(service.hasOpenForSchedule(plan.id)).resolves.toBe(true);
    await expect(service.findLastRuns([])).resolves.toEqual([]);
  });

  describe('Run History reads', () => {
    const SECOND = '2026-10-17 10:00:00';
    const filter = (overrides: Partial<PluginRunFilter> = {}): PluginRunFilter => ({
      statuses: [],
      trigger: null,
      pluginId: null,
      scheduleId: null,
      userId: null,
      ...overrides,
    });
    // Each test reads its own project, so rows of the other tests never page in.
    const project = () => `runs-${randomUUID()}`;

    async function run(
      projectId: string,
      createdAt: string,
      overrides: Partial<PluginActionExecution> = {}
    ): Promise<string> {
      const saved = await executions.save(
        executions.create({
          pluginId: randomUUID(),
          pluginVersionId: randomUUID(),
          installationId: randomUUID(),
          projectId,
          userId: 'user-1',
          action: 'update-document',
          input: { documentId: 'd1' },
          trigger: 'frontend',
          status: PluginActionExecutionStatus.SUCCEEDED,
          role: 'editor',
          tokenHash: null,
          result: { rows: 1 },
          ...overrides,
        })
      );
      // Whole-second text, as the column default stores it; a saved Date would keep milliseconds.
      await executions.query('UPDATE plugin_action_execution SET createdAt = ? WHERE id = ?', [
        createdAt,
        saved.id,
      ]);
      return saved.id;
    }

    async function allPages(
      projectId: string,
      runFilter: PluginRunFilter,
      take: number
    ): Promise<string[]> {
      const seen: string[] = [];
      let after: PluginRunCursor | null = null;
      for (;;) {
        const page = await service.listRuns(projectId, runFilter, after, take);
        seen.push(...page.map(row => row.id));
        if (page.length < take) {
          return seen;
        }
        const last = page[page.length - 1];
        after = { createdAt: last.createdAt, id: last.id };
      }
    }

    it('pages newest first through runs that share a second', async () => {
      const projectId = project();
      const tied: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        tied.push(await run(projectId, SECOND));
      }
      await run(projectId, SECOND, { userId: 'user-2' });
      const newest = await run(projectId, '2026-10-17 10:00:01');
      const oldest = await run(projectId, '2026-10-17 09:59:59');
      const expected = [newest, ...[...tied].sort().reverse(), oldest];

      for (const take of [1, 2, 3, 7]) {
        await expect(allPages(projectId, filter({ userId: 'user-1' }), take)).resolves.toEqual(
          expected
        );
      }
    });

    it('filters by status, source, plugin, schedule and owner, inside one project', async () => {
      const projectId = project();
      const pluginId = randomUUID();
      const scheduleId = randomUUID();
      const failed = await run(projectId, '2026-10-17 10:00:00', {
        pluginId,
        status: PluginActionExecutionStatus.FAILED,
        errorCode: 'DOC_LOCKED',
      });
      const timedOut = await run(projectId, '2026-10-17 10:00:01', {
        trigger: 'schedule',
        scheduleId,
        status: PluginActionExecutionStatus.TIMED_OUT,
      });
      const theirs = await run(projectId, '2026-10-17 10:00:02', { userId: 'user-2' });
      await run(project(), '2026-10-17 10:00:03');
      const ids = async (overrides: Partial<PluginRunFilter>) =>
        (await service.listRuns(projectId, filter(overrides), null, 50)).map(row => row.id);

      await expect(ids({})).resolves.toEqual([theirs, timedOut, failed]);
      await expect(
        ids({
          statuses: [PluginActionExecutionStatus.FAILED, PluginActionExecutionStatus.TIMED_OUT],
        })
      ).resolves.toEqual([timedOut, failed]);
      await expect(ids({ trigger: 'schedule' })).resolves.toEqual([timedOut]);
      await expect(ids({ scheduleId })).resolves.toEqual([timedOut]);
      await expect(ids({ pluginId })).resolves.toEqual([failed]);
      await expect(ids({ userId: 'user-2' })).resolves.toEqual([theirs]);
      await expect(
        ids({ statuses: [PluginActionExecutionStatus.FAILED], userId: 'user-2' })
      ).resolves.toEqual([]);
    });

    it('reads no payload or token column, and null for an unknown run', async () => {
      const projectId = project();
      const id = await run(projectId, SECOND, { tokenHash: createExecutionToken().tokenHash });

      const [listed] = await service.listRuns(projectId, filter(), null, 50);
      const found = await service.findRun(id);

      for (const row of [listed, found]) {
        expect(row).toMatchObject({
          id,
          projectId,
          userId: 'user-1',
          createdAt: new Date('2026-10-17T10:00:00.000Z'),
          payloadsClearedAt: null,
        });
        for (const column of ['input', 'result', 'tokenHash']) {
          expect(row).not.toMatchObject({ [column]: expect.anything() });
        }
      }
      await expect(service.findRun(randomUUID())).resolves.toBeNull();
    });
  });
});
