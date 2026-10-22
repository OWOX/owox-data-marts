import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import { SystemTrigger } from 'src/common/scheduler/shared/entities/system-trigger.entity';
import { TriggerStatus } from 'src/common/scheduler/shared/entities/trigger-status';
import { PluginActionExecution } from 'src/plugin-host/entities/plugin-action-execution.entity';
import { PluginActionSchedule } from 'src/plugin-host/entities/plugin-action-schedule.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginActionExecutionStatus } from 'src/plugin-host/enums/plugin-action-execution-status.enum';
import { PluginActionDispatcherService } from 'src/plugin-host/services/plugin-action-dispatcher.service';
import { PluginActionQueueService } from 'src/plugin-host/services/plugin-action-queue.service';
import { PluginActionStarterService } from 'src/plugin-host/services/plugin-action-starter.service';
import { PluginActionExecutionSweepProcessor } from 'src/plugin-host/system-triggers/plugin-action-execution-sweep.processor';
import type { PluginBackendDeclaration } from 'src/plugin-host/utils/plugin-manifest.util';
import * as supertest from 'supertest';
import { In, Repository } from 'typeorm';
import { waitUntil } from './utils/wait-until';

// A public address literal: the URL guard needs no DNS, and the fetch stub below answers for it.
const BACKEND_URL = 'https://93.184.216.34/owox';
const BACKEND: PluginBackendDeclaration = {
  url: BACKEND_URL,
  actions: { 'list-documents': { timeoutSeconds: 30 } },
};
const START = '/api/plugins/runtime/actions/list-documents/executions';
const OPEN = [PluginActionExecutionStatus.QUEUED, PluginActionExecutionStatus.RUNNING];
const HOUR_MS = 60 * 60 * 1000;

describe('Plugin action queue (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let executions: Repository<PluginActionExecution>;
  let fetchSpy: jest.SpyInstance;
  let repoCounter = 7_097_300;
  /** While true, the stub backend answers only when a test releases the execution. */
  let holding = true;
  const held = new Map<string, () => void>();

  const release = (executionId: string) => {
    held.get(executionId)?.();
    held.delete(executionId);
  };

  async function installPlugin() {
    repoCounter += 1;
    const plugins = app.get<Repository<Plugin>>(getRepositoryToken(Plugin));
    const versions = app.get<Repository<PluginVersion>>(getRepositoryToken(PluginVersion));
    const installations = app.get<Repository<PluginInstallation>>(
      getRepositoryToken(PluginInstallation)
    );
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: String(repoCounter),
        repoOwner: 'OWOX',
        repoName: `queue-${repoCounter}`,
        repoHtmlUrl: `https://github.com/OWOX/queue-${repoCounter}`,
      })
    );
    const version = await versions.save(
      versions.create({
        pluginId: plugin.id,
        semver: '1.0.0',
        commitSha: 'a'.repeat(40),
        githubReleaseId: String(repoCounter),
        tagName: 'v1.0.0',
        displayName: 'queue',
        description: 'queue',
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com/app/',
        releasePublishedAt: new Date(),
        backend: BACKEND,
      })
    );
    await plugins.update(plugin.id, { currentVersionId: version.id });
    // NullIdpProvider answers every member token as user '0', an admin of project '0'.
    const installation = await installations.save(
      installations.create({
        pluginId: plugin.id,
        projectId: '0',
        userId: '0',
        installedAt: new Date(),
        uninstalledAt: null,
      })
    );
    const minted = await agent
      .post(`/api/plugins/installations/${installation.id}/runtime-token`)
      .set(AUTH_HEADER)
      .expect(200);
    return { version, installation, runtimeToken: minted.body.runtimeToken as string };
  }

  function pausedSchedule(installation: PluginInstallation): Promise<PluginActionSchedule> {
    const schedules = app.get<Repository<PluginActionSchedule>>(
      getRepositoryToken(PluginActionSchedule)
    );
    // Paused, so the schedule handler never picks it up; PROCESSING, as the runner holds it during a start.
    return schedules.save(
      schedules.create({
        pluginId: installation.pluginId,
        installationId: installation.id,
        projectId: '0',
        action: 'list-documents',
        parameters: null,
        name: null,
        disabledReason: null,
        lastExecutionId: null,
        cronExpression: '0 0 1 1 *',
        timeZone: 'UTC',
        status: TriggerStatus.PROCESSING,
        isActive: false,
        nextRunTimestamp: null,
        lastRunTimestamp: null,
      })
    );
  }

  /** A row the schedule handler would have queued, `queuedAt` as given. */
  async function insertQueued(
    installation: PluginInstallation,
    version: PluginVersion,
    queuedAt: Date
  ): Promise<PluginActionExecution> {
    return executions.save(
      executions.create({
        pluginId: installation.pluginId,
        pluginVersionId: version.id,
        installationId: installation.id,
        projectId: '0',
        userId: '0',
        action: 'list-documents',
        input: null,
        trigger: 'schedule',
        scheduleId: (await pausedSchedule(installation)).id,
        status: PluginActionExecutionStatus.QUEUED,
        role: 'viewer',
        tokenHash: null,
        startedAt: null,
        deadlineAt: null,
        queuedAt,
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        result: null,
        payloadBytes: 0,
      })
    );
  }

  /** Five held frontend starts, so every start limit check refuses. */
  async function fillSlots(runtimeToken: string): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
      await agent.post(START).set('x-owox-authorization', runtimeToken).send({}).expect(202);
    }
    await waitUntil(
      async () => held.size,
      size => size === 5
    );
  }

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    executions = app.get(getRepositoryToken(PluginActionExecution));
    const realFetch = global.fetch;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url, init) => {
      if (String(url) !== BACKEND_URL) return realFetch(url, init);
      const answer = () => new Response('{"result":{"ok":true}}', { status: 200 });
      if (!holding) return Promise.resolve(answer());
      const { executionId } = JSON.parse(String(init?.body)) as { executionId: string };
      return new Promise<Response>((resolve, reject) => {
        held.set(executionId, () => resolve(answer()));
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('This operation was aborted', 'AbortError'))
        );
      });
    });
  }, 60_000);

  beforeEach(() => {
    holding = true;
  });

  afterEach(async () => {
    holding = false;
    for (const executionId of [...held.keys()]) release(executionId);
    await waitUntil(
      () => executions.countBy({ status: In(OPEN) }),
      open => open === 0
    );
  });

  afterAll(async () => {
    await closeTestApp(app);
    fetchSpy.mockRestore();
  });

  it('queues a scheduled start while five run, and starts the oldest once one finishes', async () => {
    const { version, installation, runtimeToken } = await installPlugin();
    const running: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const res = await agent
        .post(START)
        .set('x-owox-authorization', runtimeToken)
        .send({})
        .expect(202);
      running.push(res.body.id);
    }
    await waitUntil(
      async () => held.size,
      size => size === 5
    );
    const starter = app.get(PluginActionStarterService);
    const startScheduled = async () => {
      const schedule = await pausedSchedule(installation);
      return starter.startScheduled({
        installation,
        version,
        action: 'list-documents',
        input: null,
        // Provisional: promotion stores the owner's live role instead.
        role: 'viewer',
        scheduleId: schedule.id,
        scheduleVersion: schedule.version,
      });
    };

    const oldest = await startScheduled();
    const newer = await startScheduled();
    expect([oldest.status, newer.status]).toEqual([
      PluginActionExecutionStatus.QUEUED,
      PluginActionExecutionStatus.QUEUED,
    ]);
    // Set apart, so two rows queued within one millisecond cannot fall back to id order.
    await executions.update(oldest.id, { queuedAt: new Date(Date.now() - 60_000) });

    release(running[0]);

    await waitUntil(async () => held.has(oldest.id), Boolean);
    await expect(executions.findOneByOrFail({ id: oldest.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.RUNNING,
      trigger: 'schedule',
      role: 'admin',
      startedAt: expect.any(Date),
      deadlineAt: expect.any(Date),
    });
    await expect(executions.findOneByOrFail({ id: newer.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.QUEUED,
      startedAt: null,
    });
  });

  it('starts a queued execution once when two promoters race for it', async () => {
    const { version, installation } = await installPlugin();
    const dispatch = jest.spyOn(app.get(PluginActionDispatcherService), 'dispatch');
    const queue = app.get(PluginActionQueueService);

    try {
      const queued = await insertQueued(installation, version, new Date());

      await Promise.all([queue.promote(installation.id), queue.promote(installation.id)]);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0]).toMatchObject({ id: queued.id });
      await expect(executions.findOneByOrFail({ id: queued.id })).resolves.toMatchObject({
        status: PluginActionExecutionStatus.RUNNING,
        role: 'admin',
      });
    } finally {
      dispatch.mockRestore();
    }
  });

  it('times out a run queued for 25 hours and leaves one queued for 23 hours', async () => {
    const { version, installation, runtimeToken } = await installPlugin();
    await fillSlots(runtimeToken);
    const stale = await insertQueued(installation, version, new Date(Date.now() - 25 * HOUR_MS));
    const young = await insertQueued(installation, version, new Date(Date.now() - 23 * HOUR_MS));

    await app.get(PluginActionExecutionSweepProcessor).process({} as SystemTrigger);

    await expect(executions.findOneByOrFail({ id: stale.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.TIMED_OUT,
      finishedAt: expect.any(Date),
      errorCode: null,
      errorMessage: 'The run waited 24 hours in the queue',
    });
    await expect(executions.findOneByOrFail({ id: young.id })).resolves.toMatchObject({
      status: PluginActionExecutionStatus.QUEUED,
      finishedAt: null,
    });
  });
});
