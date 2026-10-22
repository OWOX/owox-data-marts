import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import type { IdpProvider } from '@owox/idp-protocol';
import { randomUUID } from 'node:crypto';
import { GracefulShutdownService } from 'src/common/scheduler/services/graceful-shutdown.service';
import { DirectTriggerRunnerService } from 'src/common/scheduler/services/runners/direct-trigger-runner.service';
import { SystemTimeService } from 'src/common/scheduler/services/system-time.service';
import { SystemTrigger } from 'src/common/scheduler/shared/entities/system-trigger.entity';
import { TriggerStatus } from 'src/common/scheduler/shared/entities/trigger-status';
import { ProjectMemberDto } from 'src/idp/dto/domain/project-member.dto';
import { IdpProjectionsFacade } from 'src/idp/facades/idp-projections.facade';
import { AuthorizationContext } from 'src/idp/types/auth.types';
import { PLUGIN_ACTION_LIMITS } from 'src/plugin-host/constants/plugin-action-limits';
import { InstallPluginCommand } from 'src/plugin-host/dto/domain/install-plugin.command';
import { UninstallPluginCommand } from 'src/plugin-host/dto/domain/uninstall-plugin.command';
import { PluginActionExecution } from 'src/plugin-host/entities/plugin-action-execution.entity';
import { PluginActionSchedule } from 'src/plugin-host/entities/plugin-action-schedule.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginActionExecutionStatus } from 'src/plugin-host/enums/plugin-action-execution-status.enum';
import { PluginScheduleDisabledReason } from 'src/plugin-host/enums/plugin-action-schedule.enum';
import { TooManyExecutionsError } from 'src/plugin-host/errors/plugin-action.errors';
import { ActionInputValidatorService } from 'src/plugin-host/services/action-input-validator.service';
import { PluginActionScheduleHandlerService } from 'src/plugin-host/services/plugin-action-schedule-handler.service';
import { PluginActionScheduleService } from 'src/plugin-host/services/plugin-action-schedule.service';
import { PluginActionStarterService } from 'src/plugin-host/services/plugin-action-starter.service';
import { PluginOwnerMembershipService } from 'src/plugin-host/services/plugin-owner-membership.service';
import { PluginActionExecutionSweepProcessor } from 'src/plugin-host/system-triggers/plugin-action-execution-sweep.processor';
import { InstallPluginService } from 'src/plugin-host/use-cases/install-plugin.service';
import { UninstallPluginService } from 'src/plugin-host/use-cases/uninstall-plugin.service';
import { hashExecutionToken } from 'src/plugin-host/utils/execution-token.util';
import type { PluginBackendDeclaration } from 'src/plugin-host/utils/plugin-manifest.util';
import * as supertest from 'supertest';
import { Repository } from 'typeorm';
import { waitUntil } from './utils/wait-until';

const SCHEDULES = '/api/plugins/runtime/schedules';
// Once a year, so nothing a test creates falls due while the suite runs.
const CRON = '0 0 1 1 *';
const NEW_YEAR = /-01-01T00:00:00\.000Z$/;

// A literal private address is refused before DNS or network, so a dispatch fails offline too.
const BACKEND: PluginBackendDeclaration = {
  url: 'https://10.0.0.1/owox',
  actions: {
    'update-document': {
      timeoutSeconds: 60,
      input: {
        type: 'object',
        properties: { documentId: { type: 'string' } },
        required: ['documentId'],
        additionalProperties: false,
      },
    },
    'list-documents': { timeoutSeconds: 30 },
  },
};

interface SeededInstallation {
  readonly pluginId: string;
  readonly versionId: string;
  readonly installationId: string;
  readonly projectId: string;
  readonly userId: string;
}

interface InstalledPlugin extends SeededInstallation {
  readonly runtimeToken: string;
}

describe('Plugin schedules (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let schedules: Repository<PluginActionSchedule>;
  let executions: Repository<PluginActionExecution>;
  let installations: Repository<PluginInstallation>;
  let primary: InstalledPlugin;
  let other: InstalledPlugin;
  let repoCounter = 7_097_000;

  // NullIdpProvider answers every member token as user '0', an admin of project '0'.
  async function seedInstallation(
    owner = { projectId: '0', userId: '0' },
    backend = BACKEND
  ): Promise<SeededInstallation> {
    const plugins = app.get<Repository<Plugin>>(getRepositoryToken(Plugin));
    const versions = app.get<Repository<PluginVersion>>(getRepositoryToken(PluginVersion));
    repoCounter += 1;
    const repoName = `schedules-e2e-${repoCounter}`;
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: String(repoCounter),
        repoOwner: 'OWOX',
        repoName,
        repoHtmlUrl: `https://github.com/OWOX/${repoName}`,
        // Already on the daily update check, so a restore makes no GitHub call.
        nextUpdateCheckAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
    );
    const version = await versions.save(
      versions.create({
        pluginId: plugin.id,
        semver: '1.0.0',
        commitSha: 'a'.repeat(40),
        githubReleaseId: String(repoCounter),
        tagName: 'v1.0.0',
        displayName: repoName,
        description: repoName,
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com/app/',
        releasePublishedAt: new Date(),
        backend,
      })
    );
    await plugins.update(plugin.id, { currentVersionId: version.id });
    const installation = await installations.save(
      installations.create({
        pluginId: plugin.id,
        ...owner,
        installedAt: new Date(),
        uninstalledAt: null,
      })
    );
    return {
      pluginId: plugin.id,
      versionId: version.id,
      installationId: installation.id,
      ...owner,
    };
  }

  async function installPlugin(backend = BACKEND): Promise<InstalledPlugin> {
    const seeded = await seedInstallation(undefined, backend);
    const minted = await agent
      .post(`/api/plugins/installations/${seeded.installationId}/runtime-token`)
      .set(AUTH_HEADER)
      .expect(200);
    return { ...seeded, runtimeToken: minted.body.runtimeToken };
  }

  const runtime = (target: InstalledPlugin = primary) => ({
    'x-owox-authorization': target.runtimeToken,
  });

  function seedSchedule(
    target: SeededInstallation,
    overrides: Partial<PluginActionSchedule> = {}
  ): Promise<PluginActionSchedule> {
    return schedules.save(
      schedules.create({
        pluginId: target.pluginId,
        installationId: target.installationId,
        projectId: target.projectId,
        action: 'list-documents',
        parameters: null,
        name: null,
        cronExpression: CRON,
        timeZone: 'UTC',
        isActive: true,
        status: TriggerStatus.IDLE,
        nextRunTimestamp: new Date('2099-01-01T00:00:00.000Z'),
        lastRunTimestamp: null,
        disabledReason: null,
        lastExecutionId: null,
        ...overrides,
      })
    );
  }

  function seedExecution(
    target: SeededInstallation,
    token: string,
    overrides: Partial<PluginActionExecution> = {}
  ): Promise<PluginActionExecution> {
    return executions.save(
      executions.create({
        pluginId: target.pluginId,
        pluginVersionId: target.versionId,
        installationId: target.installationId,
        projectId: target.projectId,
        userId: target.userId,
        action: 'list-documents',
        input: null,
        trigger: 'frontend',
        status: PluginActionExecutionStatus.RUNNING,
        role: 'editor',
        tokenHash: hashExecutionToken(token),
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 60_000),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        result: null,
        ...overrides,
      })
    );
  }

  const createSchedule = (body: Record<string, unknown> = {}, target: InstalledPlugin = primary) =>
    agent
      .post(SCHEDULES)
      .set(runtime(target))
      .send({ action: 'list-documents', cron: CRON, timeZone: 'UTC', ...body });

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    schedules = app.get(getRepositoryToken(PluginActionSchedule));
    executions = app.get(getRepositoryToken(PluginActionExecution));
    installations = app.get(getRepositoryToken(PluginInstallation));
    primary = await installPlugin();
    other = await installPlugin();
    // The handler's own minute cron would race the runs these tests drive through the runner.
    const registry = app.get(SchedulerRegistry);
    if (registry.doesExist('cron', PluginActionScheduleHandlerService.name)) {
      await registry.getCronJob(PluginActionScheduleHandlerService.name).stop();
    }
  }, 60_000);

  beforeEach(async () => {
    await schedules.clear();
    await executions.clear();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('refuses a member session on the runtime routes', async () => {
    await agent.get(SCHEDULES).set(AUTH_HEADER).expect(403);
  });

  it('creates, lists, reads, updates, pauses, resumes and deletes through a runtime token', async () => {
    await seedSchedule(other);

    const created = await createSchedule({ name: 'Yearly' }).expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'Yearly',
      action: 'list-documents',
      parameters: null,
      cron: CRON,
      timeZone: 'UTC',
      enabled: true,
      disabledReason: null,
      nextRunAt: expect.stringMatching(NEW_YEAR),
      lastRun: null,
      createdAt: expect.any(String),
      modifiedAt: expect.any(String),
    });
    const path = `${SCHEDULES}/${created.body.id}`;

    const listed = await agent.get(SCHEDULES).set(runtime()).expect(200);
    expect(listed.body).toEqual({ schedules: [created.body] });
    const read = await agent.get(path).set(runtime()).expect(200);
    expect(read.body).toEqual(created.body);

    const updated = await agent
      .patch(path)
      .set(runtime())
      .send({ cron: '0 6 1 1 *', name: null, parameters: { page: 2 } })
      .expect(200);
    expect(updated.body).toMatchObject({
      cron: '0 6 1 1 *',
      name: null,
      parameters: { page: 2 },
      enabled: true,
      nextRunAt: expect.stringMatching(/-01-01T06:00:00\.000Z$/),
    });

    const paused = await agent.post(`${path}/pause`).set(runtime()).expect(200);
    expect(paused.body).toMatchObject({ enabled: false, nextRunAt: null, disabledReason: null });
    const pausedAgain = await agent.post(`${path}/pause`).set(runtime()).expect(200);
    expect(pausedAgain.body).toMatchObject({ enabled: false, nextRunAt: null });

    const resumed = await agent.post(`${path}/resume`).set(runtime()).expect(200);
    expect(resumed.body).toMatchObject({
      enabled: true,
      nextRunAt: expect.stringMatching(/-01-01T06:00:00\.000Z$/),
    });

    await agent.delete(path).set(runtime()).expect(204);
    const gone = await agent.get(path).set(runtime()).expect(404);
    expect(gone.body.code).toBe('SCHEDULE_NOT_FOUND');
  });

  it('creates a Paused schedule when enabled is false', async () => {
    const res = await createSchedule({ enabled: false }).expect(201);

    expect(res.body).toMatchObject({ enabled: false, nextRunAt: null });
  });

  it('resumes a Disabled schedule once it validates, clearing its reason', async () => {
    const schedule = await seedSchedule(primary, {
      isActive: false,
      nextRunTimestamp: null,
      disabledReason: PluginScheduleDisabledReason.ACTION_NOT_DECLARED,
    });

    const res = await agent.post(`${SCHEDULES}/${schedule.id}/resume`).set(runtime()).expect(200);

    expect(res.body).toMatchObject({
      enabled: true,
      disabledReason: null,
      nextRunAt: expect.stringMatching(NEW_YEAR),
    });
  });

  it('keeps prototype keys in parameters', async () => {
    // Raw JSON: an object literal would read `__proto__` as the prototype, not as a key.
    const parameters = '{"__proto__":{"x":1},"constructor":2,"nested":{"prototype":3}}';

    const created = await agent
      .post(SCHEDULES)
      .set(runtime())
      .set('content-type', 'application/json')
      .send(
        `{"action":"list-documents","cron":"${CRON}","timeZone":"UTC","parameters":${parameters}}`
      )
      .expect(201);
    const path = `${SCHEDULES}/${created.body.id}`;

    const read = await agent.get(path).set(runtime()).expect(200);
    expect(JSON.stringify(read.body.parameters)).toBe(parameters);
    const stored = await schedules.findOneByOrFail({ id: created.body.id });
    expect(JSON.stringify(stored.parameters)).toBe(parameters);

    const replaced = '{"__proto__":{"y":4},"constructor":{"name":"z"}}';
    const updated = await agent
      .patch(path)
      .set(runtime())
      .set('content-type', 'application/json')
      .send(`{"parameters":${replaced}}`)
      .expect(200);
    expect(JSON.stringify(updated.body.parameters)).toBe(replaced);
    const restored = await schedules.findOneByOrFail({ id: created.body.id });
    expect(JSON.stringify(restored.parameters)).toBe(replaced);
  });

  it.each([
    ['a body key it does not know', { extra: 1 }],
    ['enabled that is not a boolean', { enabled: 'yes' }],
    ['a cron that is not a string', { cron: 5 }],
  ])('refuses a create with %s', async (_label, body) => {
    const res = await createSchedule(body).expect(400);

    expect(res.body.message).toBe('Request validation failed');
    await expect(schedules.count()).resolves.toBe(0);
  });

  it('refuses enabled on update', async () => {
    const schedule = await seedSchedule(primary);

    const res = await agent
      .patch(`${SCHEDULES}/${schedule.id}`)
      .set(runtime())
      .send({ enabled: false })
      .expect(400);

    expect(res.body).toMatchObject({
      message: 'Request validation failed',
      details: { errors: [{ message: 'property enabled should not exist.' }] },
    });
  });

  it.each([
    ['a cron it cannot read', { cron: 'every morning' }],
    ['an unknown time zone', { timeZone: 'Mars/Olympus' }],
    ['a cron with no date in the next 8 years', { cron: '0 0 30 2 *' }],
    ['a name over 200 characters', { name: 'n'.repeat(201) }],
  ])('answers INVALID_SCHEDULE 400 for %s', async (_label, body) => {
    const res = await createSchedule(body).expect(400);

    expect(res.body.code).toBe('INVALID_SCHEDULE');
  });

  it.each(['delete-document', 'constructor'])(
    'answers ACTION_NOT_DECLARED 404 for %s',
    async action => {
      const res = await createSchedule({ action }).expect(404);

      expect(res.body.code).toBe('ACTION_NOT_DECLARED');
    }
  );

  it('answers INVALID_PARAMETERS 400 with the schema errors', async () => {
    const res = await createSchedule({
      action: 'update-document',
      parameters: { documentId: 1 },
    }).expect(400);

    expect(res.body).toMatchObject({
      code: 'INVALID_PARAMETERS',
      errorDetails: { errors: [{ instancePath: '/documentId', message: 'must be string' }] },
    });
  });

  // setupBodyParsers' 2 MiB JSON parser reads these routes, so 70 KiB reaches the service.
  it('answers PARAMETERS_TOO_LARGE 413 for 70 KiB of parameters', async () => {
    const res = await createSchedule({ parameters: { blob: 'x'.repeat(70 * 1024) } }).expect(413);

    expect(res.body.code).toBe('PARAMETERS_TOO_LARGE');
  });

  it('answers a bare 413 for a body above the 2 MiB parser limit', async () => {
    const res = await createSchedule({
      parameters: { blob: 'x'.repeat(2 * 1024 * 1024) },
    }).expect(413);

    expect(res.body.code).toBeUndefined();
  });

  it('answers TOO_MANY_EXECUTIONS 429 when input validation is busy', async () => {
    const validate = jest
      .spyOn(app.get(ActionInputValidatorService), 'validate')
      .mockRejectedValueOnce(
        new TooManyExecutionsError(
          'Too many inputs of this plugin are being validated. Try again shortly.'
        )
      );

    try {
      const res = await createSchedule({
        action: 'update-document',
        parameters: { documentId: 'd1' },
      }).expect(429);

      expect(res.body.code).toBe('TOO_MANY_EXECUTIONS');
    } finally {
      validate.mockRestore();
    }
  });

  it('leaves exactly 20 schedules after 21 concurrent creates', async () => {
    // supertest listens and closes the server per request, so parallel requests need it open.
    const server = app.getHttpServer();
    await new Promise<void>(resolve => server.listen(0, resolve));
    const responses = await Promise.all(
      Array.from({ length: 21 }, (_, index) => createSchedule({ name: `s${index}` }))
    ).finally(() => server.close());

    expect(responses.map(res => res.status).sort()).toEqual([...Array(20).fill(201), 409]);
    expect(responses.find(res => res.status === 409)?.body.code).toBe('TOO_MANY_SCHEDULES');
    await expect(schedules.countBy({ installationId: primary.installationId })).resolves.toBe(20);
  });

  it('answers SCHEDULE_BUSY 409 when the runner holds the schedule for 5 s', async () => {
    const schedule = await seedSchedule(primary, { status: TriggerStatus.PROCESSING });
    const startedAt = Date.now();

    const res = await agent.post(`${SCHEDULES}/${schedule.id}/pause`).set(runtime()).expect(409);

    expect(res.body.code).toBe('SCHEDULE_BUSY');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(5000);
    await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
      isActive: true,
      version: schedule.version,
    });
  });

  it("answers SCHEDULE_NOT_FOUND 404 for another installation's schedule and leaves it as it was", async () => {
    const schedule = await seedSchedule(other);
    const path = `${SCHEDULES}/${schedule.id}`;

    // Built one at a time: supertest opens the server when a request is created.
    for (const request of [
      () => agent.get(path),
      () => agent.patch(path).send({ name: 'Taken' }),
      () => agent.post(`${path}/pause`),
      () => agent.post(`${path}/resume`),
      () => agent.delete(path),
    ]) {
      const res = await request().set(runtime()).expect(404);
      expect(res.body.code).toBe('SCHEDULE_NOT_FOUND');
    }
    await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
      name: null,
      version: schedule.version,
    });
  });

  it('refuses an id that is not a UUID', async () => {
    await agent.get(`${SCHEDULES}/not-a-uuid`).set(runtime()).expect(400);
  });

  describe('project routes', () => {
    const MEMBER_ID = 'schedules-member';
    const MEMBER_TOKEN = 'schedules-member-token';
    const MEMBER_HEADER = { 'x-owox-authorization': MEMBER_TOKEN };
    const VIEWER_ID = 'schedules-viewer';
    const VIEWER_TOKEN = 'schedules-viewer-token';
    const VIEWER_HEADER = { 'x-owox-authorization': VIEWER_TOKEN };
    const SCHEDULE_LIST = '/api/plugins/schedules';
    const spies: jest.SpyInstance[] = [];
    let member: SeededInstallation;

    const ids = (body: { items: { id: string }[] }) => body.items.map(item => item.id).sort();

    beforeAll(async () => {
      // A member who is not an admin; every other token keeps the NullIdpProvider answer.
      const idp = (app.getHttpAdapter() as { getInstance(): Express.Application })
        .getInstance()
        .get('idp') as IdpProvider;
      for (const method of ['parseToken', 'introspectToken'] as const) {
        const original = idp[method].bind(idp);
        const sessions: Record<string, { userId: string; role: string }> = {
          [MEMBER_TOKEN]: { userId: MEMBER_ID, role: 'editor' },
          [VIEWER_TOKEN]: { userId: VIEWER_ID, role: 'viewer' },
        };
        spies.push(
          jest.spyOn(idp, method).mockImplementation(async token =>
            token in sessions
              ? {
                  userId: sessions[token].userId,
                  projectId: '0',
                  roles: [sessions[token].role],
                  email: `${sessions[token].userId}@localhost`,
                  fullName: 'Member',
                }
              : original(token)
          )
        );
      }
      // The NullIdpProvider lists user 0 only; a resume asks whether the owner is still a member.
      const projections = app.get(IdpProjectionsFacade);
      const memberOf = projections.getProjectMemberOrThrow.bind(projections);
      spies.push(
        jest
          .spyOn(projections, 'getProjectMemberOrThrow')
          .mockImplementation(async (projectId, userId) =>
            [MEMBER_ID, VIEWER_ID, 'someone-else'].includes(userId)
              ? new ProjectMemberDto(
                  userId,
                  `${userId}@localhost`,
                  undefined,
                  undefined,
                  'editor',
                  false
                )
              : memberOf(projectId, userId)
          )
      );
      member = await seedInstallation({ projectId: '0', userId: MEMBER_ID });
    });

    afterAll(() => {
      for (const spy of spies) {
        spy.mockRestore();
      }
    });

    it('lists every schedule of the project for an admin, without parameters', async () => {
      const own = await seedSchedule(primary, { parameters: { documentId: 'd1' } });
      const foreign = await seedInstallation({ projectId: '0', userId: 'someone-else' });
      const theirs = await seedSchedule(foreign);
      await seedSchedule(await seedInstallation({ projectId: 'project-2', userId: '0' }));

      const res = await agent.get(SCHEDULE_LIST).set(AUTH_HEADER).expect(200);

      expect(res.body.total).toBe(2);
      expect(ids(res.body)).toEqual([own.id, theirs.id].sort());
      expect(res.body.items.find((item: { id: string }) => item.id === theirs.id)).toMatchObject({
        pluginId: foreign.pluginId,
        pluginName: expect.stringMatching(/^schedules-e2e-/),
        installationId: foreign.installationId,
        installationState: 'installed',
        // The list reads the NullIdpProvider's member list, which has user 0 only.
        ownerIsMember: false,
        canManage: true,
      });
      expect(res.body.items.find((item: { id: string }) => item.id === own.id)).toMatchObject({
        ownerIsMember: true,
      });
      for (const item of res.body.items) {
        expect(item).not.toHaveProperty('parameters');
      }
    });

    it("lists only the member's own schedules, an uninstalled installation's included", async () => {
      const mine = await seedSchedule(member, { nextRunTimestamp: null });
      await seedSchedule(primary);
      await installations.update(member.installationId, { uninstalledAt: new Date() });

      try {
        const res = await agent.get(SCHEDULE_LIST).set(MEMBER_HEADER).expect(200);

        expect(res.body).toMatchObject({
          total: 1,
          items: [{ id: mine.id, installationState: 'uninstalled', canManage: true }],
        });
      } finally {
        await installations.update(member.installationId, { uninstalledAt: null });
      }
    });

    it("narrows to one installation and reads another member's as empty", async () => {
      const own = await seedSchedule(primary);
      await seedSchedule(other);
      const path = `${SCHEDULE_LIST}?installationId=${primary.installationId}`;

      const admin = await agent.get(path).set(AUTH_HEADER).expect(200);
      expect(ids(admin.body)).toEqual([own.id]);

      const res = await agent.get(path).set(MEMBER_HEADER).expect(200);
      expect(res.body).toEqual({ items: [], total: 0 });
    });

    it('pages with limit and offset and keeps the total', async () => {
      const first = await seedSchedule(primary);
      const second = await seedSchedule(primary);
      // Same-second rows tie on createdAt and fall back to random UUIDs, so fix the order.
      await schedules.update(first.id, { createdAt: new Date('2026-01-01T00:00:00.000Z') });
      await schedules.update(second.id, { createdAt: new Date('2026-01-02T00:00:00.000Z') });

      const res = await agent.get(`${SCHEDULE_LIST}?limit=1&offset=1`).set(AUTH_HEADER).expect(200);

      expect(res.body.total).toBe(2);
      expect(ids(res.body)).toEqual([second.id]);
    });

    it('refuses an installationId that is not a UUID', async () => {
      await agent.get(`${SCHEDULE_LIST}?installationId=nope`).set(AUTH_HEADER).expect(400);
    });

    it('refuses a plugin runtime token on the list', async () => {
      await agent.get(SCHEDULE_LIST).set(runtime()).expect(403);
    });

    it('refuses an execution token on the list', async () => {
      const token = randomUUID();
      await seedExecution(primary, token);

      await agent.get(SCHEDULE_LIST).set({ 'x-owox-execution-token': token }).expect(403);
    });

    const schedulePath = (id: string) => `/api/plugins/schedules/${id}`;

    async function expectHidden(
      target: SeededInstallation,
      headers: Record<string, string>
    ): Promise<void> {
      const schedule = await seedSchedule(target);
      for (const request of [
        () => agent.post(`${schedulePath(schedule.id)}/pause`),
        () => agent.post(`${schedulePath(schedule.id)}/resume`),
        () => agent.delete(schedulePath(schedule.id)),
      ]) {
        const res = await request().set(headers).expect(404);
        expect(res.body.code).toBe('SCHEDULE_NOT_FOUND');
      }
      await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
        version: schedule.version,
        isActive: true,
      });
    }

    it("lets an admin pause, resume and delete another member's schedule", async () => {
      const foreign = await seedInstallation({ projectId: '0', userId: 'someone-else' });
      const schedule = await seedSchedule(foreign, { parameters: { documentId: 'd1' } });

      const paused = await agent
        .post(`${schedulePath(schedule.id)}/pause`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(paused.body).toMatchObject({
        id: schedule.id,
        enabled: false,
        nextRunAt: null,
        installationId: foreign.installationId,
        canManage: true,
      });
      expect(paused.body).not.toHaveProperty('parameters');
      const resumed = await agent
        .post(`${schedulePath(schedule.id)}/resume`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(resumed.body).toMatchObject({
        enabled: true,
        nextRunAt: expect.stringMatching(NEW_YEAR),
      });
      await agent.delete(schedulePath(schedule.id)).set(AUTH_HEADER).expect(204);

      await expect(schedules.countBy({ id: schedule.id })).resolves.toBe(0);
    });

    it("holds an admin's pause against the plugin's resume until a member resumes it", async () => {
      const schedule = await seedSchedule(member);
      const minted = await agent
        .post(`/api/plugins/installations/${member.installationId}/runtime-token`)
        .set(MEMBER_HEADER)
        .expect(200);
      const plugin = { 'x-owox-authorization': minted.body.runtimeToken };

      const paused = await agent
        .post(`${schedulePath(schedule.id)}/pause`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(paused.body).toMatchObject({ enabled: false, disabledReason: 'PAUSED_BY_ADMIN' });
      const refused = await agent
        .post(`${SCHEDULES}/${schedule.id}/resume`)
        .set(plugin)
        .expect(409);
      expect(refused.body.code).toBe('SCHEDULE_PAUSED_BY_ADMIN');
      const pausedByPlugin = await agent
        .post(`${SCHEDULES}/${schedule.id}/pause`)
        .set(plugin)
        .expect(200);
      expect(pausedByPlugin.body).toMatchObject({ disabledReason: 'PAUSED_BY_ADMIN' });

      const resumed = await agent
        .post(`${schedulePath(schedule.id)}/resume`)
        .set(MEMBER_HEADER)
        .expect(200);
      expect(resumed.body).toMatchObject({ enabled: true, disabledReason: null });
    });

    it('lets a member pause, resume and delete their own schedule', async () => {
      const schedule = await seedSchedule(member);

      await agent
        .post(`${schedulePath(schedule.id)}/pause`)
        .set(MEMBER_HEADER)
        .expect(200);
      await agent
        .post(`${schedulePath(schedule.id)}/resume`)
        .set(MEMBER_HEADER)
        .expect(200);
      await agent.delete(schedulePath(schedule.id)).set(MEMBER_HEADER).expect(204);

      await expect(schedules.countBy({ id: schedule.id })).resolves.toBe(0);
    });

    it("answers SCHEDULE_NOT_FOUND to a member for another member's schedule, and leaves it", async () => {
      await expectHidden(primary, MEMBER_HEADER);
    });

    it('answers SCHEDULE_NOT_FOUND to an admin for a schedule of another project, and leaves it', async () => {
      await expectHidden(
        await seedInstallation({ projectId: 'project-2', userId: '0' }),
        AUTH_HEADER
      );
    });

    it('answers SCHEDULE_NOT_FOUND for an unknown id, and 400 for one that is not a UUID', async () => {
      const res = await agent
        .post(`${schedulePath(randomUUID())}/pause`)
        .set(AUTH_HEADER)
        .expect(404);
      expect(res.body.code).toBe('SCHEDULE_NOT_FOUND');
      await agent
        .post(`${schedulePath('not-a-uuid')}/pause`)
        .set(AUTH_HEADER)
        .expect(400);
    });

    it.each([
      ['pause', 'post', '/pause'],
      ['resume', 'post', '/resume'],
      ['delete', 'delete', ''],
    ] as const)(
      'refuses a plugin runtime token on %s and leaves the schedule',
      async (_name, method, suffix) => {
        const schedule = await seedSchedule(primary);

        await agent[method](`${schedulePath(schedule.id)}${suffix}`)
          .set(runtime())
          .expect(403);

        await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
          version: schedule.version,
        });
      }
    );

    it.each([
      ['pause', 'post', '/pause'],
      ['resume', 'post', '/resume'],
      ['delete', 'delete', ''],
    ] as const)(
      'refuses an execution token on %s and leaves the schedule',
      async (_name, method, suffix) => {
        const schedule = await seedSchedule(primary);
        const token = randomUUID();
        await seedExecution(primary, token);

        await agent[method](`${schedulePath(schedule.id)}${suffix}`)
          .set({ 'x-owox-execution-token': token })
          .expect(403);

        await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
          version: schedule.version,
        });
      }
    );

    it('deletes the schedule of an uninstalled installation, so a restore does not bring it back', async () => {
      const schedule = await seedSchedule(member, { nextRunTimestamp: null });
      await installations.update(member.installationId, { uninstalledAt: new Date() });

      try {
        await agent.delete(schedulePath(schedule.id)).set(MEMBER_HEADER).expect(204);
      } finally {
        await installations.update(member.installationId, { uninstalledAt: null });
      }
      await expect(schedules.countBy({ id: schedule.id })).resolves.toBe(0);
    });

    it('refuses to resume a schedule whose owner left the project, keeping it Paused', async () => {
      const left = await seedInstallation({ projectId: '0', userId: 'left-member' });
      const schedule = await seedSchedule(left, {
        parameters: { documentId: 'd1' },
        isActive: false,
        nextRunTimestamp: null,
      });

      const res = await agent
        .post(`${schedulePath(schedule.id)}/resume`)
        .set(AUTH_HEADER)
        .expect(409);

      expect(res.body).toMatchObject({
        code: 'OWNER_NOT_MEMBER',
        message: 'The installation owner is no longer a project member, or their account is locked',
      });
      await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
        isActive: false,
        disabledReason: null,
        version: schedule.version,
      });
    });

    it('answers OWNER_CHECK_UNAVAILABLE 503 when the IDP cannot check the owner, keeping it Paused', async () => {
      const schedule = await seedSchedule(primary, {
        isActive: false,
        nextRunTimestamp: null,
      });
      jest
        .spyOn(app.get(IdpProjectionsFacade), 'getProjectMemberOrThrow')
        .mockRejectedValueOnce(new Error('IDP is down'));

      const res = await agent
        .post(`${schedulePath(schedule.id)}/resume`)
        .set(AUTH_HEADER)
        .expect(503);

      expect(res.body).toMatchObject({
        code: 'OWNER_CHECK_UNAVAILABLE',
        message: 'Could not check the installation owner. Try again shortly.',
      });
      await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
        isActive: false,
        version: schedule.version,
      });
    });

    it('keeps a schedule Disabled when its resume fails validation', async () => {
      const schedule = await seedSchedule(primary, {
        action: 'update-document',
        parameters: { documentId: 1 },
        isActive: false,
        nextRunTimestamp: null,
        disabledReason: PluginScheduleDisabledReason.INVALID_PARAMETERS,
      });

      const res = await agent
        .post(`${schedulePath(schedule.id)}/resume`)
        .set(AUTH_HEADER)
        .expect(400);

      expect(res.body).toMatchObject({
        code: 'INVALID_PARAMETERS',
        errorDetails: { errors: [{ instancePath: '/documentId', message: 'must be string' }] },
      });
      await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
        isActive: false,
        nextRunTimestamp: null,
        disabledReason: PluginScheduleDisabledReason.INVALID_PARAMETERS,
        version: schedule.version,
      });
    });

    describe('a member with the viewer role', () => {
      const RUNS = '/api/plugins/runs';
      let viewer: SeededInstallation;

      beforeAll(async () => {
        viewer = await seedInstallation({ projectId: '0', userId: VIEWER_ID });
      });

      const queuedRun = (target: SeededInstallation) =>
        seedExecution(target, randomUUID(), {
          status: PluginActionExecutionStatus.QUEUED,
          trigger: 'schedule',
          tokenHash: null,
          startedAt: null,
          deadlineAt: null,
          queuedAt: new Date(),
        });

      it('lists their own schedules and runs, and none of another member', async () => {
        const mine = await seedSchedule(viewer);
        const myRun = await seedExecution(viewer, randomUUID());
        await seedSchedule(member);
        await seedExecution(member, randomUUID());

        const listed = await agent.get(SCHEDULE_LIST).set(VIEWER_HEADER).expect(200);
        const runs = await agent.get(RUNS).set(VIEWER_HEADER).expect(200);

        expect(listed.body).toMatchObject({ total: 1, items: [{ id: mine.id, canManage: true }] });
        expect(runs.body.items.map((item: { id: string }) => item.id)).toEqual([myRun.id]);
      });

      it('pauses, resumes and deletes their own schedule', async () => {
        const schedule = await seedSchedule(viewer);

        await agent
          .post(`${schedulePath(schedule.id)}/pause`)
          .set(VIEWER_HEADER)
          .expect(200);
        await agent
          .post(`${schedulePath(schedule.id)}/resume`)
          .set(VIEWER_HEADER)
          .expect(200);
        await agent.delete(schedulePath(schedule.id)).set(VIEWER_HEADER).expect(204);

        await expect(schedules.countBy({ id: schedule.id })).resolves.toBe(0);
      });

      it('cancels their own open run', async () => {
        const queued = await queuedRun(viewer);

        const res = await agent.post(`${RUNS}/${queued.id}/cancel`).set(VIEWER_HEADER).expect(200);

        expect(res.body).toMatchObject({ id: queued.id, status: 'CANCELLED' });
      });

      it("answers 404 for another member's schedule and run, and leaves them", async () => {
        const schedule = await seedSchedule(member);
        const run = await queuedRun(member);

        await agent
          .post(`${schedulePath(schedule.id)}/pause`)
          .set(VIEWER_HEADER)
          .expect(404);
        await agent.get(`${RUNS}/${run.id}`).set(VIEWER_HEADER).expect(404);
        await agent.post(`${RUNS}/${run.id}/cancel`).set(VIEWER_HEADER).expect(404);

        await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
          isActive: true,
        });
        await expect(executions.findOneByOrFail({ id: run.id })).resolves.toMatchObject({
          status: PluginActionExecutionStatus.QUEUED,
        });
      });
    });

    describe('run history', () => {
      const RUNS = '/api/plugins/runs';
      const runIds = (body: { items: { id: string }[] }) => body.items.map(item => item.id);
      const finished = (status: PluginActionExecutionStatus) => ({
        status,
        finishedAt: new Date(),
        tokenHash: null,
      });

      it('lists every run of the project for an admin, named and without payloads', async () => {
        const schedule = await seedSchedule(primary, { name: 'Nightly' });
        const scheduled = await seedExecution(primary, randomUUID(), {
          ...finished(PluginActionExecutionStatus.SUCCEEDED),
          trigger: 'schedule',
          scheduleId: schedule.id,
          input: { documentId: 'd1' },
          result: { rows: 1 },
        });
        const theirs = await seedExecution(member, randomUUID());
        await seedExecution(
          await seedInstallation({ projectId: 'project-2', userId: '0' }),
          randomUUID()
        );

        const res = await agent.get(RUNS).set(AUTH_HEADER).expect(200);

        expect(runIds(res.body).sort()).toEqual([scheduled.id, theirs.id].sort());
        expect(res.body.nextCursor).toBeNull();
        expect(
          res.body.items.find((item: { id: string }) => item.id === scheduled.id)
        ).toMatchObject({
          pluginId: primary.pluginId,
          pluginName: expect.stringMatching(/^schedules-e2e-/),
          pluginVersion: '1.0.0',
          action: 'list-documents',
          status: 'SUCCEEDED',
          trigger: 'schedule',
          scheduleId: schedule.id,
          scheduleName: 'Nightly',
          timeLimitSeconds: 30,
          errorMessageCleared: false,
          canCancel: false,
        });
        for (const item of res.body.items) {
          for (const key of ['input', 'result', 'tokenHash', 'role']) {
            expect(item).not.toHaveProperty(key);
          }
        }
      });

      it('shows a member only runs of their own installations, whatever userId says', async () => {
        const mine = await seedExecution(member, randomUUID());
        await seedExecution(primary, randomUUID());

        const res = await agent.get(`${RUNS}?userId=0`).set(MEMBER_HEADER).expect(200);

        expect(runIds(res.body)).toEqual([mine.id]);
        expect(res.body.items[0]).toMatchObject({ canCancel: true });
      });

      it('filters by repeated status keys, source, plugin, schedule and owner', async () => {
        const schedule = await seedSchedule(primary);
        const failed = await seedExecution(primary, randomUUID(), {
          ...finished(PluginActionExecutionStatus.FAILED),
          errorCode: 'DOC_LOCKED',
          errorMessage: 'Locked',
        });
        const timedOut = await seedExecution(primary, randomUUID(), {
          ...finished(PluginActionExecutionStatus.TIMED_OUT),
          trigger: 'schedule',
          scheduleId: schedule.id,
        });
        const running = await seedExecution(member, randomUUID());
        const listed = async (query: string) =>
          runIds((await agent.get(`${RUNS}?${query}`).set(AUTH_HEADER).expect(200)).body).sort();

        await expect(listed('status=FAILED&status=TIMED_OUT')).resolves.toEqual(
          [failed.id, timedOut.id].sort()
        );
        await expect(listed('status=RUNNING')).resolves.toEqual([running.id]);
        await expect(listed('trigger=schedule')).resolves.toEqual([timedOut.id]);
        await expect(listed(`scheduleId=${schedule.id}`)).resolves.toEqual([timedOut.id]);
        await expect(listed(`pluginId=${member.pluginId}`)).resolves.toEqual([running.id]);
        await expect(listed(`userId=${MEMBER_ID}`)).resolves.toEqual([running.id]);
      });

      it('refuses the bracketed status form, and every other malformed query', async () => {
        for (const query of [
          'status[]=FAILED',
          'status=DONE',
          'trigger=cron',
          'cursor=nope',
          'limit=51',
          'pluginId=p1',
        ]) {
          await agent.get(`${RUNS}?${query}`).set(AUTH_HEADER).expect(400);
        }
      });

      it('pages through runs that share a second, each once, newest first', async () => {
        const created: string[] = [];
        for (let i = 0; i < 5; i += 1) {
          const row = await seedExecution(primary, randomUUID(), {
            ...finished(PluginActionExecutionStatus.SUCCEEDED),
          });
          await executions.query('UPDATE plugin_action_execution SET createdAt = ? WHERE id = ?', [
            '2026-10-17 10:00:00',
            row.id,
          ]);
          created.push(row.id);
        }

        const seen: string[] = [];
        const sizes: number[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < 4; page += 1) {
          const res = await agent
            .get(cursor === null ? `${RUNS}?limit=2` : `${RUNS}?limit=2&cursor=${cursor}`)
            .set(AUTH_HEADER)
            .expect(200);
          seen.push(...runIds(res.body));
          sizes.push(res.body.items.length);
          cursor = res.body.nextCursor;
          if (cursor === null) {
            break;
          }
        }

        expect(sizes).toEqual([2, 2, 1]);
        expect(cursor).toBeNull();
        expect(seen).toEqual([...created].sort().reverse());
      });

      it("lets an admin cancel another member's queued run, and answers it again once final", async () => {
        const queued = await seedExecution(member, randomUUID(), {
          status: PluginActionExecutionStatus.QUEUED,
          trigger: 'schedule',
          tokenHash: null,
          startedAt: null,
          deadlineAt: null,
          queuedAt: new Date(),
        });

        const res = await agent.post(`${RUNS}/${queued.id}/cancel`).set(AUTH_HEADER).expect(200);
        expect(res.body).toMatchObject({
          id: queued.id,
          status: 'CANCELLED',
          finishedAt: expect.any(String),
          timeLimitSeconds: null,
          canCancel: false,
        });
        const again = await agent.post(`${RUNS}/${queued.id}/cancel`).set(AUTH_HEADER).expect(200);
        expect(again.body).toMatchObject({ status: 'CANCELLED', finishedAt: res.body.finishedAt });
        const read = await agent.get(`${RUNS}/${queued.id}`).set(MEMBER_HEADER).expect(200);
        expect(read.body).toMatchObject({ id: queued.id, status: 'CANCELLED' });
      });

      it("answers EXECUTION_NOT_FOUND for a run outside the caller's set, and leaves it running", async () => {
        const theirs = await seedExecution(primary, randomUUID());
        const elsewhere = await seedExecution(
          await seedInstallation({ projectId: 'project-2', userId: '0' }),
          randomUUID()
        );
        for (const [target, headers] of [
          [theirs.id, MEMBER_HEADER],
          [elsewhere.id, AUTH_HEADER],
          [randomUUID(), AUTH_HEADER],
        ] as const) {
          for (const request of [
            () => agent.get(`${RUNS}/${target}`),
            () => agent.post(`${RUNS}/${target}/cancel`),
          ]) {
            const res = await request().set(headers).expect(404);
            expect(res.body.code).toBe('EXECUTION_NOT_FOUND');
          }
        }
        for (const row of [theirs, elsewhere]) {
          await expect(executions.findOneByOrFail({ id: row.id })).resolves.toMatchObject({
            status: PluginActionExecutionStatus.RUNNING,
          });
        }
        await agent.get(`${RUNS}/not-a-uuid`).set(AUTH_HEADER).expect(400);
        await agent.post(`${RUNS}/not-a-uuid/cancel`).set(AUTH_HEADER).expect(400);
      });

      it.each([
        ['the list', 'get', ''],
        ['one run', 'get', '/ID'],
        ['cancel', 'post', '/ID/cancel'],
      ] as const)(
        'refuses a plugin runtime token on %s and leaves the run',
        async (_name, method, suffix) => {
          const row = await seedExecution(primary, randomUUID());

          await agent[method](`${RUNS}${suffix.replace('ID', row.id)}`)
            .set(runtime())
            .expect(403);

          await expect(executions.findOneByOrFail({ id: row.id })).resolves.toMatchObject({
            status: PluginActionExecutionStatus.RUNNING,
          });
        }
      );

      it.each([
        ['the list', 'get', ''],
        ['one run', 'get', '/ID'],
        ['cancel', 'post', '/ID/cancel'],
      ] as const)(
        'refuses an execution token on %s and leaves the run',
        async (_name, method, suffix) => {
          const token = randomUUID();
          const row = await seedExecution(primary, token);

          await agent[method](`${RUNS}${suffix.replace('ID', row.id)}`)
            .set({ 'x-owox-execution-token': token })
            .expect(403);

          await expect(executions.findOneByOrFail({ id: row.id })).resolves.toMatchObject({
            status: PluginActionExecutionStatus.RUNNING,
          });
        }
      );

      it("reads a deleted schedule as null and a swept plugin message as cleared, OWOX's kept", async () => {
        const gone = await seedExecution(primary, randomUUID(), {
          ...finished(PluginActionExecutionStatus.FAILED),
          trigger: 'schedule',
          scheduleId: randomUUID(),
          errorCode: 'DOC_LOCKED',
          errorMessage: null,
          payloadsClearedAt: new Date(),
        });
        const owox = await seedExecution(primary, randomUUID(), {
          ...finished(PluginActionExecutionStatus.FAILED),
          errorCode: 'BACKEND_UNREACHABLE',
          errorMessage: 'No answer',
          payloadsClearedAt: new Date(),
        });

        const res = await agent.get(RUNS).set(AUTH_HEADER).expect(200);
        const byId = new Map(
          res.body.items.map((item: { id: string }) => [item.id, item] as const)
        );

        expect(byId.get(gone.id)).toMatchObject({
          scheduleId: gone.scheduleId,
          scheduleName: null,
          errorMessage: null,
          errorMessageCleared: true,
        });
        expect(byId.get(owox.id)).toMatchObject({
          errorMessage: 'No answer',
          errorMessageCleared: false,
        });
      });
    });
  });

  describe('with an execution token', () => {
    const asExecution = (token: string) => ({ 'x-owox-execution-token': token });

    it('lists and reads the schedules', async () => {
      const schedule = await seedSchedule(primary);
      const token = randomUUID();
      await seedExecution(primary, token);

      const listed = await agent.get(SCHEDULES).set(asExecution(token)).expect(200);
      expect(listed.body.schedules.map((item: { id: string }) => item.id)).toEqual([schedule.id]);
      await agent.get(`${SCHEDULES}/${schedule.id}`).set(asExecution(token)).expect(200);
    });

    it.each([
      ['create', 'post', ''],
      ['update', 'patch', '/ID'],
      ['pause', 'post', '/ID/pause'],
      ['resume', 'post', '/ID/resume'],
      ['delete', 'delete', '/ID'],
    ] as const)('refuses %s, before reading the body', async (_name, method, suffix) => {
      const schedule = await seedSchedule(primary);
      const token = randomUUID();
      await seedExecution(primary, token);

      const res = await agent[method](`${SCHEDULES}${suffix.replace('ID', schedule.id)}`)
        .set(asExecution(token))
        .send({})
        .expect(403);

      expect(res.body).toMatchObject({
        code: 'EXECUTION_TOKEN_NOT_ALLOWED',
        message: 'A backend action cannot change schedules',
      });
      await expect(schedules.findOneByOrFail({ id: schedule.id })).resolves.toMatchObject({
        isActive: true,
        version: schedule.version,
      });
      await expect(schedules.count()).resolves.toBe(1);
    });
  });

  describe('running schedules', () => {
    // A public address literal: the URL guard needs no DNS, and the fetch stub below answers for it.
    const STUB_URL = 'https://93.184.216.34/owox';
    const STUB_BACKEND: PluginBackendDeclaration = {
      url: STUB_URL,
      actions: {
        'sync-sheet': {
          timeoutSeconds: 30,
          input: {
            type: 'object',
            properties: { sheetId: { type: 'string' } },
            required: ['sheetId'],
            additionalProperties: false,
          },
        },
      },
    };
    const SYNC = { action: 'sync-sheet', parameters: { sheetId: 's1' } };
    const OWNER = { projectId: '0', userId: '0' } as AuthorizationContext;
    let runner: DirectTriggerRunnerService<PluginActionSchedule>;
    let fetchSpy: jest.SpyInstance;

    beforeAll(() => {
      runner = new DirectTriggerRunnerService(
        app.get(PluginActionScheduleHandlerService),
        app.get(SystemTimeService),
        app.get(GracefulShutdownService)
      );
      const realFetch = global.fetch;
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation((url, init) =>
          String(url) === STUB_URL
            ? Promise.resolve(new Response('{"result":{"rows":3}}', { status: 200 }))
            : realFetch(url, init)
        );
    });

    afterAll(() => fetchSpy.mockRestore());

    /** The runner's own path: PROCESSING, the handler, then the save of what it decided. */
    async function runNow(scheduleId: string): Promise<void> {
      await runner.runTriggers([await schedules.findOneByOrFail({ id: scheduleId })]);
    }

    const finished = (scheduleId: string) =>
      waitUntil(
        () => executions.findOneByOrFail({ scheduleId }),
        row => row.status !== PluginActionExecutionStatus.RUNNING
      );

    /** Sends `write` while the handler is held inside its start, and answers it once the runner has saved. */
    async function duringRun(
      scheduleId: string,
      method: 'pause' | 'delete',
      write: () => supertest.Test
    ): Promise<supertest.Response> {
      const starter = app.get(PluginActionStarterService);
      const startScheduled = starter.startScheduled.bind(starter);
      let release!: () => void;
      const gate = new Promise<void>(resolve => (release = resolve));
      const held = jest.spyOn(starter, 'startScheduled').mockImplementation(async request => {
        await gate;
        return startScheduled(request);
      });
      const reached = jest.spyOn(app.get(PluginActionScheduleService), method);
      try {
        const run = runNow(scheduleId);
        await waitUntil(
          async () => held.mock.calls.length,
          calls => calls === 1
        );
        await expect(schedules.findOneByOrFail({ id: scheduleId })).resolves.toMatchObject({
          status: TriggerStatus.PROCESSING,
        });

        let answered = false;
        const response = write().then(res => {
          answered = true;
          return res;
        });
        await waitUntil(
          async () => reached.mock.calls.length,
          calls => calls === 1
        );
        // Longer than one busy-loop retry, so the write has met PROCESSING at least once.
        await new Promise(resolve =>
          setTimeout(resolve, 2 * PLUGIN_ACTION_LIMITS.scheduleBusyRetryMs)
        );
        expect(answered).toBe(false);

        release();
        await run;
        return await response;
      } finally {
        held.mockRestore();
        reached.mockRestore();
      }
    }

    it('runs a due schedule against the backend and shows the execution as its last run', async () => {
      const installed = await installPlugin(STUB_BACKEND);
      const { id: scheduleId } = await seedSchedule(installed, SYNC);

      await runNow(scheduleId);

      const execution = await finished(scheduleId);
      expect(execution).toMatchObject({
        action: 'sync-sheet',
        input: { sheetId: 's1' },
        trigger: 'schedule',
        scheduleId,
        role: 'admin',
        status: PluginActionExecutionStatus.SUCCEEDED,
        result: { rows: 3 },
      });
      const row = await schedules.findOneByOrFail({ id: scheduleId });
      expect(row).toMatchObject({
        status: TriggerStatus.IDLE,
        isActive: true,
        lastExecutionId: execution.id,
        lastRunTimestamp: expect.any(Date),
      });
      expect(row.nextRunTimestamp!.getTime()).toBeGreaterThan(Date.now());
      const res = await agent.get(`${SCHEDULES}/${scheduleId}`).set(runtime(installed)).expect(200);
      expect(res.body.lastRun).toEqual({
        executionId: execution.id,
        status: 'SUCCEEDED',
        errorCode: null,
        finishedAt: expect.any(String),
      });
    });

    it('holds a pause sent during a run until the runner saves, which then cannot re-activate it', async () => {
      const installed = await installPlugin(STUB_BACKEND);
      const { id: scheduleId } = await seedSchedule(installed, SYNC);

      const res = await duringRun(scheduleId, 'pause', () =>
        agent.post(`${SCHEDULES}/${scheduleId}/pause`).set(runtime(installed))
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ enabled: false, nextRunAt: null });
      await expect(schedules.findOneByOrFail({ id: scheduleId })).resolves.toMatchObject({
        isActive: false,
        nextRunTimestamp: null,
        status: TriggerStatus.IDLE,
        lastExecutionId: expect.any(String),
      });
      await expect(finished(scheduleId)).resolves.toMatchObject({
        status: PluginActionExecutionStatus.SUCCEEDED,
      });
    });

    it('holds a delete sent during a run until the runner saves, which then cannot insert it again', async () => {
      const installed = await installPlugin(STUB_BACKEND);
      const { id: scheduleId } = await seedSchedule(installed, SYNC);

      const res = await duringRun(scheduleId, 'delete', () =>
        agent.delete(`${SCHEDULES}/${scheduleId}`).set(runtime(installed))
      );

      expect(res.status).toBe(204);
      await expect(schedules.findOneBy({ id: scheduleId })).resolves.toBeNull();
      await expect(finished(scheduleId)).resolves.toMatchObject({
        status: PluginActionExecutionStatus.SUCCEEDED,
      });
    });

    /** Runs the schedule on a stale claim: another replica's recovery took the row back, then `write` changed it. */
    async function runStale(scheduleId: string, write: () => supertest.Test): Promise<void> {
      const starter = app.get(PluginActionStarterService);
      const startScheduled = starter.startScheduled.bind(starter);
      const stale = jest.spyOn(starter, 'startScheduled').mockImplementation(async request => {
        await schedules.update(scheduleId, {
          status: TriggerStatus.IDLE,
          version: () => 'version + 1',
        });
        await write();
        return startScheduled(request);
      });
      try {
        await runNow(scheduleId);
      } finally {
        stale.mockRestore();
      }
    }

    it('keeps a schedule deleted after its claim went stale, and starts no run', async () => {
      const installed = await installPlugin(STUB_BACKEND);
      const { id: scheduleId } = await seedSchedule(installed, SYNC);

      await runStale(scheduleId, () =>
        agent.delete(`${SCHEDULES}/${scheduleId}`).set(runtime(installed)).expect(204)
      );

      await expect(schedules.findOneBy({ id: scheduleId })).resolves.toBeNull();
      await expect(executions.countBy({ scheduleId })).resolves.toBe(0);
    });

    it('keeps a schedule paused after its claim went stale, and starts no run', async () => {
      const installed = await installPlugin(STUB_BACKEND);
      const { id: scheduleId } = await seedSchedule(installed, SYNC);

      await runStale(scheduleId, () =>
        agent.post(`${SCHEDULES}/${scheduleId}/pause`).set(runtime(installed)).expect(200)
      );

      await expect(schedules.findOneByOrFail({ id: scheduleId })).resolves.toMatchObject({
        isActive: false,
        nextRunTimestamp: null,
        status: TriggerStatus.IDLE,
        lastExecutionId: null,
      });
      await expect(executions.countBy({ scheduleId })).resolves.toBe(0);
    });

    it('parks the schedules of an uninstalled installation and runs them again after a restore and a sweep', async () => {
      const installed = await installPlugin(STUB_BACKEND);
      const { id: scheduleId } = await seedSchedule(installed, SYNC);

      await app
        .get(UninstallPluginService)
        .run(new UninstallPluginCommand(installed.pluginId, OWNER));

      await expect(schedules.findOneByOrFail({ id: scheduleId })).resolves.toMatchObject({
        isActive: true,
        disabledReason: null,
        nextRunTimestamp: null,
      });
      // A slot saved by a runner whose start beat the uninstall, which leaves held rows alone: its next run parks it.
      await schedules.update(scheduleId, { nextRunTimestamp: new Date(Date.now() - 1000) });
      await runNow(scheduleId);
      await expect(schedules.findOneByOrFail({ id: scheduleId })).resolves.toMatchObject({
        isActive: true,
        nextRunTimestamp: null,
      });
      await expect(executions.countBy({ scheduleId })).resolves.toBe(0);

      await app
        .get(InstallPluginService)
        .run(new InstallPluginCommand(installed.pluginId, installed.versionId, OWNER));
      await app.get(PluginActionExecutionSweepProcessor).process({} as SystemTrigger);

      const restored = await schedules.findOneByOrFail({ id: scheduleId });
      expect(restored.nextRunTimestamp!.getTime()).toBeGreaterThan(Date.now());
      await runNow(scheduleId);
      await expect(finished(scheduleId)).resolves.toMatchObject({
        trigger: 'schedule',
        status: PluginActionExecutionStatus.SUCCEEDED,
      });
    });

    it('parks a schedule whose installation is uninstalled while the runner holds it, and unparks it after a restore', async () => {
      const installed = await installPlugin(STUB_BACKEND);
      const { id: scheduleId } = await seedSchedule(installed, SYNC);
      const owners = app.get(PluginOwnerMembershipService);
      const activeMember = owners.activeMember.bind(owners);
      // After the handler read the installation, before its start.
      const uninstalling = jest
        .spyOn(owners, 'activeMember')
        .mockImplementationOnce(async (projectId, userId) => {
          await app
            .get(UninstallPluginService)
            .run(new UninstallPluginCommand(installed.pluginId, OWNER));
          return activeMember(projectId, userId);
        });
      try {
        await runNow(scheduleId);
      } finally {
        uninstalling.mockRestore();
      }

      await expect(schedules.findOneByOrFail({ id: scheduleId })).resolves.toMatchObject({
        status: TriggerStatus.IDLE,
        isActive: true,
        nextRunTimestamp: null,
      });
      await expect(executions.countBy({ scheduleId })).resolves.toBe(0);

      await app
        .get(InstallPluginService)
        .run(new InstallPluginCommand(installed.pluginId, installed.versionId, OWNER));
      await app.get(PluginActionExecutionSweepProcessor).process({} as SystemTrigger);

      const restored = await schedules.findOneByOrFail({ id: scheduleId });
      expect(restored.nextRunTimestamp!.getTime()).toBeGreaterThan(Date.now());
    });

    describe('a handler that disables the schedule', () => {
      const versionsOf = () =>
        app.get<Repository<PluginVersion>>(getRepositoryToken(PluginVersion));

      async function expectDisabled(
        scheduleId: string,
        reason: PluginScheduleDisabledReason
      ): Promise<void> {
        await expect(schedules.findOneByOrFail({ id: scheduleId })).resolves.toMatchObject({
          isActive: false,
          disabledReason: reason,
          nextRunTimestamp: null,
          status: TriggerStatus.IDLE,
        });
        await expect(executions.countBy({ scheduleId })).resolves.toBe(0);
      }

      it('skips the run of a schedule whose owner is not a project member, keeping it Active', async () => {
        const foreign = await seedInstallation(
          { projectId: '0', userId: 'someone-else' },
          STUB_BACKEND
        );
        const { id } = await seedSchedule(foreign, SYNC);

        await runNow(id);

        await expect(schedules.findOneByOrFail({ id })).resolves.toMatchObject({
          isActive: true,
          disabledReason: null,
          nextRunTimestamp: expect.any(Date),
          status: TriggerStatus.IDLE,
        });
        await expect(executions.countBy({ scheduleId: id })).resolves.toBe(0);
      });

      it('disables a schedule whose action the current version no longer declares, and resumes it once declared again', async () => {
        const installed = await installPlugin(STUB_BACKEND);
        const { id } = await seedSchedule(installed, SYNC);
        await versionsOf().save({
          id: installed.versionId,
          backend: { url: STUB_URL, actions: { other: { timeoutSeconds: 30 } } },
        });

        await runNow(id);

        await expectDisabled(id, PluginScheduleDisabledReason.ACTION_NOT_DECLARED);
        const listed = await agent
          .get(`/api/plugins/schedules?installationId=${installed.installationId}`)
          .set(AUTH_HEADER)
          .expect(200);
        expect(listed.body.items[0]).toMatchObject({
          enabled: false,
          disabledReason: 'ACTION_NOT_DECLARED',
        });

        await versionsOf().save({ id: installed.versionId, backend: STUB_BACKEND });
        const resumed = await agent
          .post(`/api/plugins/schedules/${id}/resume`)
          .set(AUTH_HEADER)
          .expect(200);
        expect(resumed.body).toMatchObject({ enabled: true, disabledReason: null });
        await expect(schedules.findOneByOrFail({ id })).resolves.toMatchObject({
          isActive: true,
          disabledReason: null,
          nextRunTimestamp: expect.any(Date),
        });
      });

      it('disables a schedule whose stored parameters fail a tightened input schema', async () => {
        const installed = await installPlugin(STUB_BACKEND);
        const { id } = await seedSchedule(installed, SYNC);
        await versionsOf().save({
          id: installed.versionId,
          backend: {
            url: STUB_URL,
            actions: {
              'sync-sheet': {
                timeoutSeconds: 30,
                input: {
                  type: 'object',
                  properties: { sheetId: { type: 'integer' } },
                  required: ['sheetId'],
                  additionalProperties: false,
                },
              },
            },
          },
        });

        await runNow(id);

        await expectDisabled(id, PluginScheduleDisabledReason.INVALID_PARAMETERS);
      });
    });

    it('queues a due schedule behind the running limit, and starts it once when the sweep finds a free slot', async () => {
      const installed = await installPlugin(STUB_BACKEND);
      const running: PluginActionExecution[] = [];
      for (let index = 0; index < PLUGIN_ACTION_LIMITS.maxRunningPerInstallation; index += 1) {
        running.push(await seedExecution(installed, `running-${index}`));
      }
      const { id: scheduleId } = await seedSchedule(installed, SYNC);

      await runNow(scheduleId);

      const queued = await executions.findOneByOrFail({ scheduleId });
      await expect(executions.countBy({ scheduleId })).resolves.toBe(1);
      expect(queued).toMatchObject({
        trigger: 'schedule',
        status: PluginActionExecutionStatus.QUEUED,
        queuedAt: expect.any(Date),
        scheduleId,
        startedAt: null,
      });
      const listed = await agent
        .get(`/api/plugins/schedules?installationId=${installed.installationId}`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(listed.body.items[0].lastRun).toMatchObject({
        executionId: queued.id,
        status: 'QUEUED',
      });
      const dispatched = () =>
        fetchSpy.mock.calls.filter(
          ([url, init]) =>
            String(url) === STUB_URL &&
            (JSON.parse(String(init?.body)) as { executionId: string }).executionId === queued.id
        ).length;
      expect(dispatched()).toBe(0);

      await executions.update(running[0].id, {
        status: PluginActionExecutionStatus.SUCCEEDED,
        finishedAt: new Date(),
      });
      await app.get(PluginActionExecutionSweepProcessor).process({} as SystemTrigger);

      await expect(finished(scheduleId)).resolves.toMatchObject({
        id: queued.id,
        status: PluginActionExecutionStatus.SUCCEEDED,
        startedAt: expect.any(Date),
      });
      expect(dispatched()).toBe(1);
      await expect(schedules.findOneByOrFail({ id: scheduleId })).resolves.toMatchObject({
        lastExecutionId: queued.id,
      });
      await app.get(PluginActionExecutionSweepProcessor).process({} as SystemTrigger);
      expect(dispatched()).toBe(1);
    });
  });
});
