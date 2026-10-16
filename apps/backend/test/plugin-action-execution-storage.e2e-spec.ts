import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestApp } from '@owox/test-utils';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { PluginActionExecution } from 'src/plugin-host/entities/plugin-action-execution.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginActionExecutionStatus } from 'src/plugin-host/enums/plugin-action-execution-status.enum';
import {
  InstallationInactiveError,
  TooManyExecutionsError,
} from 'src/plugin-host/errors/plugin-action.errors';
import {
  InsertRunningExecutionInput,
  PluginActionExecutionService,
} from 'src/plugin-host/services/plugin-action-execution.service';
import { createExecutionToken } from 'src/plugin-host/utils/execution-token.util';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('Plugin action execution storage (e2e)', () => {
  let app: INestApplication;
  let service: PluginActionExecutionService;
  let executions: Repository<PluginActionExecution>;
  let repoCounter = 870_000;

  beforeAll(async () => {
    app = (await createTestApp()).app;
    service = app.get(PluginActionExecutionService);
    executions = app.get(getRepositoryToken(PluginActionExecution));
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
});
