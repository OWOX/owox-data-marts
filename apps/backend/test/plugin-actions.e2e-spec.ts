import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import { randomUUID } from 'node:crypto';
import { PluginActionExecution } from 'src/plugin-host/entities/plugin-action-execution.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginActionExecutionStatus } from 'src/plugin-host/enums/plugin-action-execution-status.enum';
import { TooManyExecutionsError } from 'src/plugin-host/errors/plugin-action.errors';
import { ActionInputValidatorService } from 'src/plugin-host/services/action-input-validator.service';
import { PluginActionExecutionService } from 'src/plugin-host/services/plugin-action-execution.service';
import { hashExecutionToken } from 'src/plugin-host/utils/execution-token.util';
import type { PluginBackendDeclaration } from 'src/plugin-host/utils/plugin-manifest.util';
import { SystemTrigger } from 'src/common/scheduler/shared/entities/system-trigger.entity';
import { SystemTriggerType } from 'src/common/scheduler/system-tasks/system-trigger-type';
import * as supertest from 'supertest';
import { Repository } from 'typeorm';

const RUNTIME = '/api/plugins/runtime';
const startPath = (action: string) => `${RUNTIME}/actions/${action}/executions`;
const CURRENT = `${RUNTIME}/executions/current`;

// A literal private address is refused before DNS or network, so dispatch fails offline too.
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
    // Passes the release check, yet costs schema × input: 2,000 branches for each element.
    'count-zeros': {
      timeoutSeconds: 30,
      input: {
        type: 'array',
        items: { anyOf: [...Array.from({ length: 1997 }, () => false), true] },
      },
    },
  },
};

interface InstalledPlugin {
  readonly pluginId: string;
  readonly repositoryId: string;
  readonly versionId: string;
  readonly installationId: string;
  readonly runtimeToken: string;
}

describe('Plugin backend actions (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let executions: Repository<PluginActionExecution>;
  let primary: InstalledPlugin;

  async function installPlugin(repoName: string, githubRepoId: string): Promise<InstalledPlugin> {
    const plugins = app.get<Repository<Plugin>>(getRepositoryToken(Plugin));
    const versions = app.get<Repository<PluginVersion>>(getRepositoryToken(PluginVersion));
    const installations = app.get<Repository<PluginInstallation>>(
      getRepositoryToken(PluginInstallation)
    );
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId,
        repoOwner: 'OWOX',
        repoName,
        repoHtmlUrl: `https://github.com/OWOX/${repoName}`,
      })
    );
    const version = await versions.save(
      versions.create({
        pluginId: plugin.id,
        semver: '1.0.0',
        commitSha: 'a'.repeat(40),
        githubReleaseId: githubRepoId,
        tagName: 'v1.0.0',
        displayName: repoName,
        description: repoName,
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
    return {
      pluginId: plugin.id,
      repositoryId: githubRepoId,
      versionId: version.id,
      installationId: installation.id,
      runtimeToken: minted.body.runtimeToken,
    };
  }

  function seedExecution(
    token: string,
    overrides: Partial<PluginActionExecution> = {}
  ): Promise<PluginActionExecution> {
    return executions.save(
      executions.create({
        pluginId: primary.pluginId,
        pluginVersionId: primary.versionId,
        installationId: primary.installationId,
        projectId: '0',
        userId: '0',
        action: 'list-documents',
        input: { page: 1 },
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

  async function settled(id: string): Promise<PluginActionExecution> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const execution = await executions.findOneByOrFail({ id });
      if (execution.status !== PluginActionExecutionStatus.RUNNING) {
        return execution;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Execution ${id} is still running`);
  }

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    executions = app.get<Repository<PluginActionExecution>>(
      getRepositoryToken(PluginActionExecution)
    );
    primary = await installPlugin('actions-e2e', '7095');
  }, 60_000);

  beforeEach(() => executions.clear());

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('registers the execution sweep as a system trigger at boot', async () => {
    const triggers = app.get<Repository<SystemTrigger>>(getRepositoryToken(SystemTrigger));

    await expect(
      triggers.findOneBy({ type: SystemTriggerType.PLUGIN_ACTION_EXECUTION_SWEEP })
    ).resolves.toMatchObject({ cronExpression: '* * * * *', isActive: true });
  });

  it('refuses a member token', async () => {
    await agent.post(startPath('list-documents')).set(AUTH_HEADER).send({}).expect(403);
  });

  it.each(['delete-document', 'constructor'])('%s is not declared', async action => {
    const res = await agent
      .post(startPath(action))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({})
      .expect(404);

    expect(res.body.code).toBe('ACTION_NOT_DECLARED');
  });

  it('refuses input above 256 KiB with its code', async () => {
    const res = await agent
      .post(startPath('update-document'))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({ input: { documentId: 'x'.repeat(300 * 1024) } })
      .expect(413);

    expect(res.body.code).toBe('INPUT_TOO_LARGE');
  });

  it('refuses a body above 512 KiB before it reaches the service', async () => {
    const res = await agent
      .post(startPath('update-document'))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({ input: { documentId: 'x'.repeat(600 * 1024) } })
      .expect(413);

    expect(res.body.code).toBeUndefined();
  });

  it('refuses input that does not match the schema, saying where', async () => {
    const res = await agent
      .post(startPath('update-document'))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({ input: { documentId: 1 } })
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'INVALID_INPUT',
      errorDetails: { errors: [{ instancePath: '/documentId', message: 'must be string' }] },
    });
  });

  it('stores input as sent, keys such as __proto__ and constructor included', async () => {
    // Raw JSON: an object literal would read `__proto__` as the prototype, not as a key.
    const input =
      '{"__proto__":{"polluted":true},"constructor":"x","nested":{"prototype":1,"constructor":{"name":"y"}}}';

    const res = await agent
      .post(startPath('list-documents'))
      .set('x-owox-authorization', primary.runtimeToken)
      .set('content-type', 'application/json')
      .send(`{"input":${input}}`)
      .expect(202);

    expect(JSON.stringify((await settled(res.body.id)).input)).toBe(input);
  });

  it('starts without a request body, as with no input', async () => {
    const res = await agent
      .post(startPath('list-documents'))
      .set('x-owox-authorization', primary.runtimeToken)
      .expect(202);

    await expect(settled(res.body.id)).resolves.toMatchObject({ input: null });
  });

  it('refuses a body property other than input', async () => {
    const res = await agent
      .post(startPath('list-documents'))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({ input: null, inputs: { page: 1 } })
      .expect(400);

    expect(res.body).toMatchObject({
      message: 'Request validation failed',
      details: { errors: [{ message: 'property inputs should not exist.' }] },
    });
  });

  it('refuses input whose validation runs past its budget, and keeps serving', async () => {
    const zeros = Array.from({ length: 131_000 }, () => 0);
    const startedAt = Date.now();

    const res = await agent
      .post(startPath('count-zeros'))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({ input: zeros })
      .expect(400);

    expect(Date.now() - startedAt).toBeLessThan(8000);
    expect(res.body).toMatchObject({
      code: 'INVALID_INPUT',
      errorDetails: {
        errors: [{ instancePath: '', message: 'Input validation exceeded its budget' }],
      },
    });
    await agent
      .post(startPath('update-document'))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({ input: { documentId: 'd1' } })
      .expect(202);
  });

  it('answers TOO_MANY_EXECUTIONS 429 when the input validator refuses a start', async () => {
    // The counting is in the validator's unit spec; this pins the HTTP answer.
    const validate = jest
      .spyOn(app.get(ActionInputValidatorService), 'validate')
      .mockRejectedValueOnce(
        new TooManyExecutionsError(
          'Too many inputs of this plugin are being validated. Try again shortly.'
        )
      );

    try {
      const res = await agent
        .post(startPath('update-document'))
        .set('x-owox-authorization', primary.runtimeToken)
        .send({ input: { documentId: 'd1' } })
        .expect(429);

      expect(res.body).toMatchObject({
        code: 'TOO_MANY_EXECUTIONS',
        message: 'Too many inputs of this plugin are being validated. Try again shortly.',
      });
    } finally {
      validate.mockRestore();
    }
  });

  it('refuses input nested 10,000 levels deep as INVALID_INPUT, not a server error', async () => {
    const depth = 10_000;
    const res = await agent
      .post(startPath('list-documents'))
      .set('x-owox-authorization', primary.runtimeToken)
      .set('content-type', 'application/json')
      .send(`{"input":${'['.repeat(depth)}${']'.repeat(depth)}}`)
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'INVALID_INPUT',
      errorDetails: { errors: [{ instancePath: '', message: 'is nested deeper than 100 levels' }] },
    });
  });

  it('refuses a backend action starting another action', async () => {
    const token = randomUUID();
    await seedExecution(token);

    const res = await agent
      .post(startPath('list-documents'))
      .set('x-owox-execution-token', token)
      .send({})
      .expect(403);

    expect(res.body.code).toBe('EXECUTION_TOKEN_NOT_ALLOWED');
  });

  it('refuses a sixth running execution', async () => {
    for (let index = 0; index < 5; index += 1) {
      await seedExecution(randomUUID());
    }

    const res = await agent
      .post(startPath('list-documents'))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({})
      .expect(429);

    expect(res.body.code).toBe('TOO_MANY_EXECUTIONS');
  });

  it('answers 202 at once and records the dispatch outcome on the execution', async () => {
    const res = await agent
      .post(startPath('list-documents'))
      .set('x-owox-authorization', primary.runtimeToken)
      .send({})
      .expect(202);

    expect(res.body).toEqual({ id: expect.any(String), status: 'RUNNING' });
    // NullIdpProvider issues runtime tokens with the member's admin role.
    await expect(settled(res.body.id)).resolves.toMatchObject({
      installationId: primary.installationId,
      userId: '0',
      action: 'list-documents',
      input: null,
      trigger: 'frontend',
      role: 'admin',
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'BACKEND_UNREACHABLE',
    });
  });

  describe('while the plugin is suspended', () => {
    let plugins: Repository<Plugin>;

    beforeAll(() => {
      plugins = app.get<Repository<Plugin>>(getRepositoryToken(Plugin));
    });

    beforeEach(() => plugins.update(primary.pluginId, { suspendedAt: new Date() }));

    afterEach(() => plugins.update(primary.pluginId, { suspendedAt: null }));

    it('answers a start with PLUGIN_SUSPENDED, which the host reports as a suspension', async () => {
      const res = await agent
        .post(startPath('list-documents'))
        .set('x-owox-authorization', primary.runtimeToken)
        .send({})
        .expect(400);

      expect(res.body).toMatchObject({
        code: 'PLUGIN_SUSPENDED',
        errorDetails: { pluginId: primary.pluginId },
      });
      await expect(executions.count()).resolves.toBe(0);
    });

    it('answers the execution token with PLUGIN_SUSPENDED', async () => {
      const token = randomUUID();
      await seedExecution(token);

      const res = await agent.get(CURRENT).set('x-owox-execution-token', token).expect(400);

      expect(res.body.code).toBe('PLUGIN_SUSPENDED');
    });
  });

  describe('reading, waiting and cancelling', () => {
    let other: InstalledPlugin;

    const read = (id: string, token = primary.runtimeToken) =>
      agent.get(`${RUNTIME}/executions/${id}`).set('x-owox-authorization', token);
    const cancel = (id: string, token = primary.runtimeToken) =>
      agent.post(`${RUNTIME}/executions/${id}/cancel`).set('x-owox-authorization', token);

    beforeAll(async () => {
      other = await installPlugin('actions-e2e-other', '7096');
    });

    it('answers a running execution at once, without its input', async () => {
      const execution = await seedExecution(randomUUID());

      const res = await read(execution.id).expect(200);

      expect(res.body).toEqual({
        id: execution.id,
        action: 'list-documents',
        status: 'RUNNING',
        trigger: 'frontend',
        scheduleId: null,
        startedAt: expect.any(String),
        deadlineAt: expect.any(String),
        finishedAt: null,
        result: null,
        error: null,
      });
    });

    it('holds a poll open until the execution finishes', async () => {
      const execution = await seedExecution(randomUUID());
      setTimeout(() => {
        void executions.update(execution.id, {
          status: PluginActionExecutionStatus.SUCCEEDED,
          result: { rows: 3 },
          finishedAt: new Date(),
        });
      }, 1500);
      const startedAt = Date.now();

      const res = await read(execution.id).query({ waitSeconds: '20' }).expect(200);

      expect(res.body).toMatchObject({ status: 'SUCCEEDED', result: { rows: 3 }, error: null });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1400);
      expect(Date.now() - startedAt).toBeLessThan(5000);
    });

    it('stops polling once the client goes away', async () => {
      const execution = await seedExecution(randomUUID());
      const findById = jest.spyOn(app.get(PluginActionExecutionService), 'findById');
      const reads = () => findById.mock.calls.filter(([id]) => id === execution.id).length;

      try {
        await expect(
          read(execution.id).query({ waitSeconds: '20' }).timeout(500)
        ).rejects.toMatchObject({ timeout: 500 });
        const readsAtClose = reads();
        await new Promise(resolve => setTimeout(resolve, 2000));

        expect(readsAtClose).toBe(1);
        expect(reads()).toBe(readsAtClose);
      } finally {
        findById.mockRestore();
      }
    });

    it('reports a failed dispatch through the poll', async () => {
      const started = await agent
        .post(startPath('list-documents'))
        .set('x-owox-authorization', primary.runtimeToken)
        .send({})
        .expect(202);

      const res = await read(started.body.id).query({ waitSeconds: '20' }).expect(200);

      expect(res.body).toMatchObject({
        status: 'FAILED',
        result: null,
        error: { code: 'BACKEND_UNREACHABLE' },
      });
    });

    it("answers another installation's execution as not found and leaves it running", async () => {
      const execution = await seedExecution(randomUUID());

      const hidden = await read(execution.id, other.runtimeToken).expect(404);
      const refused = await cancel(execution.id, other.runtimeToken).expect(404);

      expect(hidden.body.code).toBe('EXECUTION_NOT_FOUND');
      expect(refused.body.code).toBe('EXECUTION_NOT_FOUND');
      await expect(executions.findOneByOrFail({ id: execution.id })).resolves.toMatchObject({
        status: PluginActionExecutionStatus.RUNNING,
      });
    });

    it.each(['abc', '1.5', '-1'])('refuses waitSeconds=%s', async waitSeconds => {
      const execution = await seedExecution(randomUUID());

      await read(execution.id).query({ waitSeconds }).expect(400);
    });

    it('clamps waitSeconds above the cap instead of refusing it', async () => {
      const execution = await seedExecution(randomUUID(), {
        status: PluginActionExecutionStatus.SUCCEEDED,
        result: { rows: 3 },
        finishedAt: new Date(),
      });

      const res = await read(execution.id).query({ waitSeconds: '999' }).expect(200);

      expect(res.body).toMatchObject({ status: 'SUCCEEDED', result: { rows: 3 } });
    });

    it('refuses an id that is not a UUID', async () => {
      await read('not-a-uuid').expect(400);
    });

    it('cancels once and answers the same execution again', async () => {
      const execution = await seedExecution(randomUUID());

      const first = await cancel(execution.id).expect(200);
      const second = await cancel(execution.id).expect(200);

      expect(first.body).toMatchObject({
        status: 'CANCELLED',
        error: { code: 'CANCELLED', message: 'The execution was cancelled' },
      });
      expect(second.body).toEqual(first.body);
    });

    it('leaves a finished execution as it was', async () => {
      const execution = await seedExecution(randomUUID(), {
        status: PluginActionExecutionStatus.SUCCEEDED,
        result: { rows: 3 },
        finishedAt: new Date(),
      });

      const res = await cancel(execution.id).expect(200);

      expect(res.body).toMatchObject({ status: 'SUCCEEDED', result: { rows: 3 }, error: null });
    });
  });

  describe('execution token', () => {
    const asExecution = (path: string, token: string) =>
      agent.get(path).set('x-owox-execution-token', token);

    it('gives a backend action its own context', async () => {
      const token = randomUUID();
      const deadlineAt = new Date('2099-01-01T00:00:00.000Z');
      const execution = await seedExecution(token, { deadlineAt });

      const res = await asExecution(CURRENT, token).expect(200);

      expect(res.body).toEqual({
        executionId: execution.id,
        action: 'list-documents',
        input: { page: 1 },
        trigger: 'frontend',
        scheduleId: null,
        deadlineAt: deadlineAt.toISOString(),
        plugin: { id: primary.pluginId, repositoryId: primary.repositoryId },
        pluginVersion: '1.0.0',
        installationId: primary.installationId,
        projectId: '0',
        userId: '0',
        credentialHandles: [],
      });
    });

    it('lets a backend action read data marts with the role stored at start', async () => {
      const token = randomUUID();
      await seedExecution(token);

      await asExecution('/api/data-marts', token).expect(200);
    });

    it('refuses a request that also carries a runtime token', async () => {
      const token = randomUUID();
      await seedExecution(token);

      await asExecution(CURRENT, token)
        .set('x-owox-authorization', primary.runtimeToken)
        .expect(401);
    });

    it('refuses an unknown token', async () => {
      await asExecution(CURRENT, randomUUID()).expect(401);
    });

    it.each([
      ['past its deadline', { deadlineAt: new Date(Date.now() - 1000) }],
      [
        'that has finished',
        { status: PluginActionExecutionStatus.SUCCEEDED, finishedAt: new Date() },
      ],
    ])('refuses the token of an execution %s', async (_label, overrides) => {
      const token = randomUUID();
      await seedExecution(token, overrides);

      await asExecution(CURRENT, token).expect(401);
    });

    it('the token of a cancelled execution is refused', async () => {
      const token = randomUUID();
      const execution = await seedExecution(token);
      await asExecution(CURRENT, token).expect(200);

      await agent
        .post(`${RUNTIME}/executions/${execution.id}/cancel`)
        .set('x-owox-authorization', primary.runtimeToken)
        .expect(200);

      await asExecution(CURRENT, token).expect(401);
      await asExecution('/api/data-marts', token).expect(401);
    });

    it('lets the token past the AI declaration and model checks to its installation binding', async () => {
      const plugin = await installPlugin('actions-e2e-ai', '7139');
      await app
        .get<Repository<PluginVersion>>(getRepositoryToken(PluginVersion))
        .update(plugin.versionId, {
          credentialRequirements: [{ id: 'ai', optional: false, models: ['fast'] }],
        });
      const token = randomUUID();
      await seedExecution(token, {
        pluginId: plugin.pluginId,
        pluginVersionId: plugin.versionId,
        installationId: plugin.installationId,
      });

      const res = await agent
        .post(`${RUNTIME}/credentials/ai/ai/generate`)
        .set('x-owox-execution-token', token)
        .send({ version: 1, model: 'fast', options: {} })
        .expect(404);

      // The binding lookup is the first check after the declared model; no provider is needed.
      expect(res.body.message).toBe('Credential ai is not configured');
    });

    it('refuses a runtime token on executions/current, which is not read as an id', async () => {
      // Routed to executions/:id, 'current' would fail the UUID pipe with 400 instead.
      const res = await agent
        .get(CURRENT)
        .set('x-owox-authorization', primary.runtimeToken)
        .expect(403);

      expect(res.body.code).toBe('EXECUTION_TOKEN_REQUIRED');
    });
  });
});
