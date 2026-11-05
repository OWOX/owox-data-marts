import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { IdpProvider, McpScope, Role } from '@owox/idp-protocol';
import { closeTestApp, createTestApp, DataMartBuilder, StorageBuilder } from '@owox/test-utils';
import { DataSource } from 'typeorm';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import { DataMart } from '../src/data-marts/entities/data-mart.entity';
import { DataMartRelationship } from '../src/data-marts/entities/data-mart-relationship.entity';
import { DataMartScheduledTrigger } from '../src/data-marts/entities/data-mart-scheduled-trigger.entity';
import { DataMartStatus } from '../src/data-marts/enums/data-mart-status.enum';
import { ScheduledTriggerType } from '../src/data-marts/scheduled-trigger-types/enums/scheduled-trigger-type.enum';

const browser = { 'x-owox-authorization': 'model-schedules-test' };
type Era = 'legacy' | 'modern';

// Real persistence, use cases, ACL decisions and MCP transport; only the external IdP is stubbed.
describe('Data Mart model and connector schedules through MCP', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let database: DataSource;
  let baseUrl: URL;
  let storageId: string;
  let projectId = '0';
  let userId = '1';
  let roles: Role[] = ['admin'];
  let scopes: McpScope[] = ['mcp:read', 'mcp:write'];
  const clients: Client[] = [];
  const environment = {
    OWOX_AUTH_PUBLIC_BASE_URL: process.env.OWOX_AUTH_PUBLIC_BASE_URL,
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    MCP_PUBLIC_BASE_URL: process.env.MCP_PUBLIC_BASE_URL,
    SCHEDULER_EXECUTION_ENABLED: process.env.SCHEDULER_EXECUTION_ENABLED,
  };

  beforeAll(async () => {
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';
    process.env.PUBLIC_ORIGIN = 'https://app.owox.com';
    process.env.SCHEDULER_EXECUTION_ENABLED = 'false';
    ({ app, agent } = await createTestApp());
    database = app.get(DataSource);
    const provider = app.get(IdpProviderService).getProviderFromApp();
    const payload = () => ({
      projectId,
      userId,
      roles,
      email: `${userId}@example.test`,
      fullName: `User ${userId}`,
    });
    jest.spyOn(provider, 'parseToken').mockImplementation(async () => payload());
    jest.spyOn(provider, 'introspectToken').mockImplementation(async () => payload());
    jest.spyOn(provider, 'getProjectMembers').mockResolvedValue([
      {
        userId: '1',
        email: 'owner@example.test',
        fullName: 'Owner',
        projectRole: 'admin',
        userStatus: 'active',
        hasNotificationsEnabled: true,
        isOutbound: false,
      },
      {
        userId: '2',
        email: 'editor@example.test',
        fullName: 'Editor',
        projectRole: 'editor',
        userStatus: 'active',
        hasNotificationsEnabled: true,
        isOutbound: false,
      },
      {
        userId: '3',
        email: 'viewer@example.test',
        fullName: 'Viewer',
        projectRole: 'viewer',
        userStatus: 'active',
        hasNotificationsEnabled: true,
        isOutbound: false,
      },
    ]);
    jest.spyOn(provider, 'verifyMcpAccessToken').mockImplementation(
      async (_token, resource) =>
        ({
          clientId: 'model-schedules-test',
          projectId,
          userId,
          roles,
          scopes,
          resource,
          authFlow: 'mcp',
        }) as Awaited<ReturnType<IdpProvider['verifyMcpAccessToken']>>
    );
    const storage = await agent
      .post('/api/data-storages')
      .set(browser)
      .send(new StorageBuilder().build());
    expect(storage.status).toBe(201);
    storageId = storage.body.id;
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    process.env.MCP_PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;
    baseUrl = new URL(`http://127.0.0.1:${port}/mcp`);
  }, 120_000);

  beforeEach(() => {
    projectId = '0';
    userId = '1';
    roles = ['admin'];
    scopes = ['mcp:read', 'mcp:write'];
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close();
  });
  afterAll(async () => {
    if (app) await closeTestApp(app);
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function connect(era: Era = 'modern') {
    const client = new Client(
      { name: 'model-schedules-test', version: '1' },
      era === 'modern' ? { versionNegotiation: { mode: 'auto' } } : undefined
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(baseUrl, {
        authProvider: { token: async () => 'mcp-token' } as never,
      })
    );
    return client;
  }
  async function call<T = Record<string, unknown>>(
    client: Client,
    name: string,
    input: Record<string, unknown>
  ) {
    const result = await client.callTool({ name, arguments: input });
    expect(result).not.toMatchObject({ isError: true });
    return result.structuredContent as T;
  }
  async function denied(client: Client, name: string, input: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: input });
    expect(result.isError).toBe(true);
  }
  async function mart(title: string) {
    const response = await agent
      .post('/api/data-marts')
      .set(browser)
      .send(new DataMartBuilder().withStorageId(storageId).withTitle(title).build());
    expect(response.status).toBe(201);
    return String(response.body.id);
  }
  async function connectorMart(title: string) {
    const id = await mart(title);
    const response = await agent
      .put(`/api/data-marts/${id}/definition`)
      .set(browser)
      .send({
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name: 'OpenHolidays',
              configuration: [{ countryIsoCode: 'CH', languageIsoCode: 'EN' }],
              node: 'publicHolidays',
              fields: ['id', 'date', 'name'],
            },
            storage: { fullyQualifiedName: 'test_dataset.test_holidays' },
          },
        },
      });
    expect(response.status).toBe(200);
    // A published fixture avoids publish's automatic connector run. Schedule validation stays real.
    await database.getRepository(DataMart).update(id, { status: DataMartStatus.PUBLISHED });
    return id;
  }
  async function sharing(id: string, reporting: boolean, maintenance: boolean) {
    expect(
      (
        await agent
          .put(`/api/data-marts/${id}/availability`)
          .set(browser)
          .send({ availableForReporting: reporting, availableForMaintenance: maintenance })
      ).status
    ).toBe(204);
  }
  async function relate(client: Client, source: string, target: string, alias: string) {
    const result = await call<{ relationship: { id: string } }>(
      client,
      'create_data_mart_relationship',
      {
        data_mart_id: source,
        target_data_mart_id: target,
        target_alias: alias,
        join_conditions: [],
        description: 'Orders per customer',
      }
    );
    return result.relationship.id;
  }

  it.each(['legacy', 'modern'] as const)(
    'persists relationship CRUD and exposes the same HTTP state over %s transport',
    async era => {
      const source = await mart('Relationship source');
      const target = await mart('Relationship target');
      const client = await connect(era);
      const id = await relate(client, source, target, 'orders');
      const repository = database.getRepository(DataMartRelationship);
      expect(await repository.findOneByOrFail({ id })).toMatchObject({
        sourceDataMart: { id: source },
        targetDataMart: { id: target },
        targetAlias: 'orders',
        joinConditions: [],
        projectId: '0',
      });
      const http = await agent.get(`/api/data-marts/${source}/relationships/graph`).set(browser);
      expect(http.status).toBe(200);
      expect(http.body.nodes).toEqual([
        expect.objectContaining({
          relationship: expect.objectContaining({ id, targetAlias: 'orders' }),
        }),
      ]);
      await call(client, 'update_data_mart_relationship', {
        data_mart_id: source,
        relationship_id: id,
        target_alias: 'purchases',
        description: null,
      });
      expect(await repository.findOneByOrFail({ id })).toMatchObject({
        targetAlias: 'purchases',
        description: null,
      });
      expect(
        await call(client, 'list_data_mart_relationships', { data_mart_id: source })
      ).toMatchObject({
        rootDataMartId: source,
        nodes: [
          expect.objectContaining({
            aliasPath: 'purchases',
            relationship: expect.objectContaining({ id, targetAlias: 'purchases' }),
          }),
        ],
      });
      await call(client, 'delete_data_mart_relationship', {
        data_mart_id: source,
        relationship_id: id,
      });
      expect(await repository.findOneBy({ id })).toBeNull();
      expect(
        (await agent.get(`/api/data-marts/${source}/relationships/graph`).set(browser)).body.nodes
      ).toEqual([]);
    }
  );

  it('omits inaccessible graph branches and their otherwise readable descendants', async () => {
    const source = await mart('Visible root');
    const hidden = await mart('Private target');
    const child = await mart('Visible child');
    const leaf = await mart('Visible leaf');
    const admin = await connect();
    await relate(admin, source, hidden, 'private_target');
    await relate(admin, hidden, child, 'child');
    await relate(admin, child, leaf, 'leaf');
    await relate(admin, source, child, 'public_child');
    await sharing(hidden, false, false);
    userId = '2';
    roles = ['editor'];
    const editor = await connect();
    const graph = await call<{ nodes: Array<{ aliasPath: string }> }>(
      editor,
      'list_data_mart_relationships',
      { data_mart_id: source }
    );
    expect(graph.nodes.map(node => node.aliasPath)).toEqual(['public_child', 'public_child.leaf']);
    expect(JSON.stringify(graph)).not.toContain(hidden);
    expect(JSON.stringify(graph)).not.toContain('Private target');
    const http = await agent.get(`/api/data-marts/${source}/relationships/graph`).set(browser);
    expect(http.status).toBe(200);
    expect(http.body.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationship: expect.objectContaining({
            targetDataMart: expect.objectContaining({ id: hidden, userHasAccess: false }),
          }),
        }),
      ])
    );
  });

  it('enforces source and target relationship EDIT access with the real ACL', async () => {
    const source = await mart('Shared source');
    const target = await mart('Private target');
    const admin = await connect();
    const id = await relate(admin, source, target, 'existing');
    await sharing(target, false, false);
    userId = '2';
    roles = ['editor'];
    const editor = await connect();
    await denied(editor, 'create_data_mart_relationship', {
      data_mart_id: source,
      target_data_mart_id: target,
      target_alias: 'denied',
      join_conditions: [],
    });
    expect(
      (
        await agent
          .post(`/api/data-marts/${source}/relationships`)
          .set(browser)
          .send({ targetDataMartId: target, targetAlias: 'denied', joinConditions: [] })
      ).status
    ).toBe(403);
    userId = '1';
    roles = ['admin'];
    await sharing(source, true, false);
    userId = '2';
    roles = ['editor'];
    const restrictedEditor = await connect();
    await denied(restrictedEditor, 'update_data_mart_relationship', {
      data_mart_id: source,
      relationship_id: id,
      target_alias: 'denied',
    });
    await denied(restrictedEditor, 'delete_data_mart_relationship', {
      data_mart_id: source,
      relationship_id: id,
    });
    expect(
      (
        await agent
          .patch(`/api/data-marts/${source}/relationships/${id}`)
          .set(browser)
          .send({ targetAlias: 'denied' })
      ).status
    ).toBe(403);
    expect(
      (await agent.delete(`/api/data-marts/${source}/relationships/${id}`).set(browser)).status
    ).toBe(403);
    userId = '3';
    roles = ['viewer'];
    const viewer = await connect();
    await denied(viewer, 'delete_data_mart_relationship', {
      data_mart_id: source,
      relationship_id: id,
    });
    expect(
      await database.getRepository(DataMartRelationship).findOneByOrFail({ id })
    ).toMatchObject({ targetAlias: 'existing' });
    expect(
      await database
        .getRepository(DataMartRelationship)
        .count({ where: { sourceDataMart: { id: source } } })
    ).toBe(1);
  });

  it('persists connector schedule CRUD and preserves omitted timezone/activity fields', async () => {
    const id = await connectorMart('Scheduled connector');
    userId = '2';
    roles = ['editor'];
    const client = await connect();
    const created = await call(client, 'create_data_mart_run_schedule', {
      data_mart_id: id,
      cron_expression: '0 1 * * *',
      time_zone: 'America/New_York',
      is_active: false,
    });
    const triggerId = String(created.trigger_id);
    const repository = database.getRepository(DataMartScheduledTrigger);
    expect(await repository.findOneByOrFail({ id: triggerId })).toMatchObject({
      dataMart: { id },
      type: 'CONNECTOR_RUN',
      cronExpression: '0 1 * * *',
      timeZone: 'America/New_York',
      isActive: false,
      createdById: '2',
    });
    const http = await agent
      .get(`/api/data-marts/${id}/scheduled-triggers/${triggerId}`)
      .set(browser);
    expect(http.status).toBe(200);
    expect(http.body).toMatchObject({
      id: triggerId,
      timeZone: 'America/New_York',
      isActive: false,
    });
    expect(
      await call(client, 'update_data_mart_run_schedule', {
        data_mart_id: id,
        trigger_id: triggerId,
        cron_expression: '0 2 * * *',
      })
    ).toMatchObject({ time_zone: 'America/New_York', is_active: false });
    const updated = await call(client, 'update_data_mart_run_schedule', {
      data_mart_id: id,
      trigger_id: triggerId,
      cron_expression: '0 3 * * *',
      time_zone: 'UTC',
      is_active: true,
    });
    expect(updated).toMatchObject({
      time_zone: 'UTC',
      is_active: true,
      next_run_at: expect.any(String),
    });
    expect(await repository.findOneByOrFail({ id: triggerId })).toMatchObject({
      cronExpression: '0 3 * * *',
      timeZone: 'UTC',
      isActive: true,
    });
    expect(await call(client, 'list_data_mart_run_schedules', { data_mart_id: id })).toMatchObject({
      schedules: [expect.objectContaining({ trigger_id: triggerId, data_mart_id: id })],
    });
    await call(client, 'delete_data_mart_run_schedule', {
      data_mart_id: id,
      trigger_id: triggerId,
    });
    expect(await repository.findOneBy({ id: triggerId })).toBeNull();
    expect((await agent.get(`/api/data-marts/${id}/scheduled-triggers`).set(browser)).body).toEqual(
      []
    );
  });

  it('refuses schedule IDs from another Data Mart or project without modifying their rows', async () => {
    const source = await connectorMart('Schedule owner');
    const other = await connectorMart('Other connector');
    const client = await connect();
    const created = await call(client, 'create_data_mart_run_schedule', {
      data_mart_id: source,
      cron_expression: '0 1 * * *',
    });
    const triggerId = String(created.trigger_id);
    await denied(client, 'update_data_mart_run_schedule', {
      data_mart_id: other,
      trigger_id: triggerId,
      cron_expression: '0 5 * * *',
    });
    await denied(client, 'delete_data_mart_run_schedule', {
      data_mart_id: other,
      trigger_id: triggerId,
    });
    expect(
      (
        await agent
          .put(`/api/data-marts/${other}/scheduled-triggers/${triggerId}`)
          .set(browser)
          .send({ cronExpression: '0 5 * * *', timeZone: 'UTC', isActive: true })
      ).status
    ).toBe(404);
    expect(
      (await agent.delete(`/api/data-marts/${other}/scheduled-triggers/${triggerId}`).set(browser))
        .status
    ).toBe(404);
    expect(await call(client, 'list_data_mart_run_schedules', { data_mart_id: other })).toEqual({
      schedules: [],
    });
    projectId = 'other';
    const foreignProject = await connect();
    await denied(foreignProject, 'update_data_mart_run_schedule', {
      data_mart_id: source,
      trigger_id: triggerId,
      cron_expression: '0 6 * * *',
    });
    await denied(foreignProject, 'list_data_mart_run_schedules', { data_mart_id: source });
    expect(
      await database.getRepository(DataMartScheduledTrigger).findOneByOrFail({ id: triggerId })
    ).toMatchObject({ dataMart: { id: source, projectId: '0' }, cronExpression: '0 1 * * *' });
  });

  it.each(['editor', 'viewer'] as const)(
    'rejects schedule writes without maintenance access for a %s while allowing SEE',
    async role => {
      const id = await connectorMart('Read-only scheduled connector');
      const admin = await connect();
      const created = await call(admin, 'create_data_mart_run_schedule', {
        data_mart_id: id,
        cron_expression: '0 1 * * *',
      });
      const triggerId = String(created.trigger_id);
      await sharing(id, true, false);
      userId = role === 'editor' ? '2' : '3';
      roles = [role];
      const member = await connect();
      expect(
        await call(member, 'list_data_mart_run_schedules', { data_mart_id: id })
      ).toMatchObject({ schedules: [expect.objectContaining({ trigger_id: triggerId })] });
      await denied(member, 'create_data_mart_run_schedule', {
        data_mart_id: id,
        cron_expression: '0 5 * * *',
      });
      await denied(member, 'update_data_mart_run_schedule', {
        data_mart_id: id,
        trigger_id: triggerId,
        cron_expression: '0 6 * * *',
      });
      await denied(member, 'delete_data_mart_run_schedule', {
        data_mart_id: id,
        trigger_id: triggerId,
      });
      expect(
        (
          await agent.post(`/api/data-marts/${id}/scheduled-triggers`).set(browser).send({
            type: 'CONNECTOR_RUN',
            cronExpression: '0 5 * * *',
            timeZone: 'UTC',
            isActive: true,
          })
        ).status
      ).toBe(403);
      expect(
        (
          await agent
            .put(`/api/data-marts/${id}/scheduled-triggers/${triggerId}`)
            .set(browser)
            .send({ cronExpression: '0 6 * * *', timeZone: 'UTC', isActive: true })
        ).status
      ).toBe(403);
      expect(
        (await agent.delete(`/api/data-marts/${id}/scheduled-triggers/${triggerId}`).set(browser))
          .status
      ).toBe(403);
      expect(
        await database.getRepository(DataMartScheduledTrigger).findOneByOrFail({ id: triggerId })
      ).toMatchObject({ cronExpression: '0 1 * * *' });
      expect(
        await database
          .getRepository(DataMartScheduledTrigger)
          .count({ where: { dataMart: { id } } })
      ).toBe(1);
    }
  );
  it('keeps non-connector schedules outside MCP mutations while preserving generic HTTP updates', async () => {
    const id = await connectorMart('Quality schedule owner');
    const repository = database.getRepository(DataMartScheduledTrigger);
    const trigger = await repository.save(
      repository.create({
        dataMart: await database.getRepository(DataMart).findOneByOrFail({ id }),
        type: ScheduledTriggerType.DATA_QUALITY_RUN,
        cronExpression: '0 1 * * *',
        timeZone: 'UTC',
        isActive: false,
        createdById: '1',
      })
    );
    const client = await connect();
    expect(await call(client, 'list_data_mart_run_schedules', { data_mart_id: id })).toEqual({
      schedules: [],
    });
    await denied(client, 'update_data_mart_run_schedule', {
      data_mart_id: id,
      trigger_id: trigger.id,
      cron_expression: '0 2 * * *',
    });
    await denied(client, 'delete_data_mart_run_schedule', {
      data_mart_id: id,
      trigger_id: trigger.id,
    });
    expect(await repository.findOneByOrFail({ id: trigger.id })).toMatchObject({
      type: 'DATA_QUALITY_RUN',
      cronExpression: '0 1 * * *',
      isActive: false,
    });
    const http = await agent
      .put(`/api/data-marts/${id}/scheduled-triggers/${trigger.id}`)
      .set(browser)
      .send({ cronExpression: '0 3 * * *', timeZone: 'UTC', isActive: false });
    expect(http.status).toBe(200);
    expect(await repository.findOneByOrFail({ id: trigger.id })).toMatchObject({
      type: 'DATA_QUALITY_RUN',
      cronExpression: '0 3 * * *',
    });
    expect(
      (await agent.delete(`/api/data-marts/${id}/scheduled-triggers/${trigger.id}`).set(browser))
        .status
    ).toBe(200);
    expect(await repository.findOneBy({ id: trigger.id })).toBeNull();
  });
});
