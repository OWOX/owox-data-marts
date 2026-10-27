import { INestApplication } from '@nestjs/common';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import { z } from 'zod-v4';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { AddressInfo } from 'node:net';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Context } from '../src/data-marts/entities/context.entity';
import { UserProvisioningContextSettingsService } from '../src/data-marts/services/context/user-provisioning-context-settings.service';
import type { DataMartIconValue } from '../src/data-marts/enums/data-mart-icon.enum';
import type { IdpProvider, McpScope, Role } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import { UserProjectionDto } from '../src/idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../src/idp/dto/domain/user-projections-list.dto';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import { ProjectRole } from '../src/data-marts/enums/project-role.enum';
import { RoleScope } from '../src/data-marts/enums/role-scope.enum';
import { ContextAccessService } from '../src/data-marts/services/context/context-access.service';
import {
  MCP_CONTEXTS_FACADE,
  type McpContextsFacade,
} from '../src/data-marts/facades/mcp-contexts.facade';
import {
  PROJECT_SETTINGS_FACADE,
  type ProjectSettingsFacade,
} from '../src/project-settings/facades/project-settings.facade';
import type { McpAuthContext } from '../src/ee/mcp/auth/mcp-auth-context';

describe('MCP Context and project configuration with real persistence and access decisions', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let contexts: McpContextsFacade;
  let settings: ProjectSettingsFacade;
  let verifyMcp: jest.SpyInstance<
    ReturnType<IdpProvider['verifyMcpAccessToken']>,
    Parameters<IdpProvider['verifyMcpAccessToken']>
  >;
  let currentRoles: Role[] = ['admin'];
  let currentScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  let currentProjectId = '0';
  const clients: Client[] = [];
  let hasProjectAccess = true;
  let baseUrl: URL;
  const originalMcpPublicBaseUrl = process.env.MCP_PUBLIC_BASE_URL;
  const originalOwoxAuthPublicBaseUrl = process.env.OWOX_AUTH_PUBLIC_BASE_URL;
  const admin: McpAuthContext = {
    clientId: 'test',
    projectId: '0',
    userId: '0',
    roles: ['admin'],
    scopes: ['mcp:read', 'mcp:write'],
    resource: 'https://mcp.example/mcp',
    authFlow: 'mcp',
  };
  async function connectMcp(era: 'legacy' | 'modern' = 'legacy'): Promise<Client> {
    const client = new Client(
      { name: 'configuration-test', version: '1' },
      era === 'modern' ? { versionNegotiation: { mode: 'auto' } } : undefined
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(baseUrl, {
        authProvider: { token: async () => 'configuration-test-token' } as never,
      })
    );
    return client;
  }

  beforeAll(async () => {
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    const projections = app.get(IdpProjectionsFacade);
    const members = [
      new ProjectMemberDto('0', 'admin@example.test', 'Admin', undefined, 'admin', true),
      new ProjectMemberDto('1', 'editor@example.test', 'Data Owner', undefined, 'editor', true),
      new ProjectMemberDto('2', 'viewer@example.test', 'Business User', undefined, 'viewer', true),
    ];
    jest.spyOn(projections, 'getProjectMembers').mockResolvedValue(members);
    jest.spyOn(projections, 'getProjectMembersOrThrow').mockResolvedValue(members);
    jest
      .spyOn(projections, 'getUserProjectionList')
      .mockImplementation(
        async ids =>
          new UserProjectionsListDto(
            ids.map(id => new UserProjectionDto(id, `User ${id}`, `user${id}@example.test`))
          )
      );
    const provider = app.get(IdpProviderService).getProviderFromApp();
    verifyMcp = jest.spyOn(provider, 'verifyMcpAccessToken');
    const introspect = provider.introspectToken.bind(provider);
    jest.spyOn(provider, 'introspectToken').mockImplementation(async token => {
      const payload = await introspect(token);
      return payload ? { ...payload, roles: currentRoles } : null;
    });
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    process.env.MCP_PUBLIC_BASE_URL = `http://127.0.0.1:${address.port}`;
    baseUrl = new URL(`http://127.0.0.1:${address.port}/mcp`);
    contexts = app.get(MCP_CONTEXTS_FACADE);
    settings = app.get(PROJECT_SETTINGS_FACADE);
  }, 120000);

  beforeEach(() => {
    currentRoles = ['admin'];
    currentScopes = ['mcp:read', 'mcp:write'];
    hasProjectAccess = true;
    currentProjectId = admin.projectId;
    verifyMcp.mockReset().mockImplementation(async (_token, resource) =>
      hasProjectAccess
        ? {
            ...admin,
            projectId: currentProjectId,
            resource,
            roles: currentRoles,
            scopes: currentScopes,
          }
        : null
    );
  });

  afterEach(async () => {
    hasProjectAccess = true;
    currentRoles = ['admin'];
    currentScopes = ['mcp:read', 'mcp:write'];
    currentProjectId = admin.projectId;
    for (const client of clients.splice(0)) await client.close();
    for (const context of await contexts.listContexts(admin.projectId)) {
      await contexts.setContextMembers(admin, { contextId: context.id, assignedUserIds: [] });
      await contexts.deleteContext(admin, { contextId: context.id });
    }
    await settings.updateDescription(admin.projectId, { description: null });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
    if (app) await closeTestApp(app);
    if (originalMcpPublicBaseUrl === undefined) delete process.env.MCP_PUBLIC_BASE_URL;
    else process.env.MCP_PUBLIC_BASE_URL = originalMcpPublicBaseUrl;
    if (originalOwoxAuthPublicBaseUrl === undefined) delete process.env.OWOX_AUTH_PUBLIC_BASE_URL;
    else process.env.OWOX_AUTH_PUBLIC_BASE_URL = originalOwoxAuthPublicBaseUrl;
  });

  it.each(['viewer', 'editor'] as const)(
    'rejects administrative HTTP and MCP calls for %s without persisting changes',
    async role => {
      const created = await agent
        .post('/api/contexts')
        .set(AUTH_HEADER)
        .send({ name: `Protected ${role}`, description: 'Keep notes', icon: 'purchases' })
        .expect(201);
      const id: string = created.body.id;
      await contexts.setContextMembers(admin, { contextId: id, assignedUserIds: ['1'] });
      await settings.updateDescription(admin.projectId, { description: 'Keep project notes' });
      const before = await agent.get('/api/contexts').set(AUTH_HEADER).expect(200);
      currentRoles = [role];
      const client = await connectMcp();
      try {
        await agent
          .post('/api/contexts')
          .set(AUTH_HEADER)
          .send({ name: 'Forbidden create' })
          .expect(403);
        await agent
          .put(`/api/contexts/${id}`)
          .set(AUTH_HEADER)
          .send({ name: 'Forbidden update', description: null })
          .expect(403);
        await agent
          .put(`/api/contexts/${id}/icon`)
          .set(AUTH_HEADER)
          .send({ icon: null })
          .expect(403);
        await agent.get(`/api/contexts/${id}/impact`).set(AUTH_HEADER).expect(403);
        await agent
          .put(`/api/contexts/${id}/members`)
          .set(AUTH_HEADER)
          .send({ assignedUserIds: [] })
          .expect(403);
        await agent.delete(`/api/contexts/${id}`).set(AUTH_HEADER).expect(403);
        await agent
          .put('/api/projects/settings/description')
          .set(AUTH_HEADER)
          .send({ description: null })
          .expect(403);
        const calls = [
          { name: 'create_context', arguments: { name: 'Forbidden MCP create' } },
          {
            name: 'update_context_metadata',
            arguments: {
              context_id: id,
              name: 'Forbidden MCP update',
              description: null,
              icon: null,
            },
          },
          { name: 'get_context_impact', arguments: { context_id: id } },
          { name: 'set_context_members', arguments: { context_id: id, assigned_user_ids: [] } },
          { name: 'delete_context', arguments: { context_id: id } },
          { name: 'update_project_description', arguments: { description: null } },
        ];
        for (const call of calls) {
          const result = await client.callTool(call);
          expect(result.isError).toBe(true);
          expect(result.content).toEqual([
            { type: 'text', text: 'Access denied. Required project role: admin' },
          ]);
        }
        for (const name of ['list_project_members', 'get_project_settings']) {
          const result = await client.callTool({ name, arguments: {} });
          expect(result.isError).not.toBe(true);
        }
        const after = await agent.get('/api/contexts').set(AUTH_HEADER).expect(200);
        expect(after.body).toEqual(before.body);
        expect(await settings.getSettings(admin.projectId)).toMatchObject({
          description: 'Keep project notes',
        });
        expect(
          await app.get(ContextAccessService).getMemberContextIds('1', admin.projectId)
        ).toContain(id);
      } finally {
        currentRoles = ['admin'];
        await contexts.setContextMembers(admin, { contextId: id, assignedUserIds: [] });
        await contexts.deleteContext(admin, { contextId: id });
      }
    }
  );

  it.each(['legacy', 'modern'] as const)(
    'enforces role changes and access revocation on subsequent MCP requests (%s)',
    async era => {
      const client = await connectMcp(era);
      let createdContextId: string | undefined;
      try {
        expect(client.getProtocolEra()).toBe(era);
        const created = await client.callTool({
          name: 'create_context',
          arguments: { name: `SDK authorization ${era}`, description: 'Keep SDK notes' },
        });
        expect(created.isError).not.toBe(true);
        const { id } = z.object({ id: z.string() }).parse(created.structuredContent);
        createdContextId = id;
        const updateContext = {
          name: 'update_context_metadata',
          arguments: { context_id: id, description: null },
        };
        const updateProject = {
          name: 'update_project_description',
          arguments: { description: 'SDK project notes' },
        };
        const saved = await client.callTool(updateProject);
        expect(saved.isError).not.toBe(true);
        expect(saved.structuredContent).toEqual({ description: 'SDK project notes' });

        currentRoles = ['viewer'];
        for (const call of [updateContext, updateProject]) {
          const denied = await client.callTool(call);
          expect(denied.isError).toBe(true);
          expect(denied.content).toEqual([
            { type: 'text', text: 'Access denied. Required project role: admin' },
          ]);
        }
        expect(await contexts.listContexts(admin.projectId)).toEqual(
          expect.arrayContaining([expect.objectContaining({ id, description: 'Keep SDK notes' })])
        );
        expect(await settings.getSettings(admin.projectId)).toMatchObject({
          description: 'SDK project notes',
        });
        currentRoles = ['admin'];
        const recovered = await client.callTool(updateContext);
        expect(recovered.isError).not.toBe(true);
        expect(recovered.structuredContent).toMatchObject({ id, description: null });
        hasProjectAccess = false;
        await expect(client.callTool(updateProject)).rejects.toThrow();
      } finally {
        hasProjectAccess = true;
        currentRoles = ['admin'];
        if (createdContextId) {
          await contexts.deleteContext(admin, { contextId: createdContextId });
        }
      }
    }
  );

  it('rejects unknown setup arguments through the SDK without changing persisted state', async () => {
    const context = await contexts.createContext(admin, {
      name: 'Strict inputs',
      description: 'Keep notes',
    });
    const before = await contexts.listContexts(admin.projectId);
    const client = await connectMcp();
    for (const call of [
      { name: 'create_context', arguments: { name: 'Must not create' } },
      {
        name: 'update_context_metadata',
        arguments: { context_id: context.id, name: 'Must not rename' },
      },
      { name: 'get_context_impact', arguments: { context_id: context.id } },
      { name: 'set_context_members', arguments: { context_id: context.id, assigned_user_ids: [] } },
      { name: 'delete_context', arguments: { context_id: context.id } },
      { name: 'list_project_members', arguments: {} },
      { name: 'get_project_settings', arguments: {} },
      { name: 'update_project_description', arguments: { description: 'Must not persist' } },
      { name: 'list_contexts', arguments: {} },
    ]) {
      const rejected = await client.callTool({
        ...call,
        arguments: {
          ...call.arguments,
          project_id: 'foreign',
          user_id: 'foreign',
          roles: ['admin'],
          descripton: null,
        },
      });
      expect(rejected.isError).toBe(true);
      expect(rejected.content).toEqual([
        { type: 'text', text: expect.stringContaining('Unrecognized') },
      ]);
    }
    const typo = await client.callTool({
      name: 'update_context_metadata',
      arguments: { context_id: context.id, name: 'Must not rename', descripton: null },
    });
    expect(typo.isError).toBe(true);
    expect(typo.content).toEqual([{ type: 'text', text: expect.stringContaining('descripton') }]);
    expect(await contexts.listContexts(admin.projectId)).toEqual(before);
    expect((await settings.getSettings(admin.projectId)).description).toBeNull();
  });

  it('reports an IDP lookup failure through MCP instead of returning an empty member list', async () => {
    const lookup = jest.spyOn(app.get(IdpProjectionsFacade), 'getProjectMembersOrThrow');
    const original = lookup.getMockImplementation()!;
    lookup.mockRejectedValue(new Error('Project membership is unavailable'));
    try {
      const client = await connectMcp();
      const result = await client.callTool({ name: 'list_project_members', arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: 'Project membership is unavailable' }]);
    } finally {
      lookup.mockImplementation(original);
    }
  });

  it('excludes removed members from discovery and rejects their assignment without replacing current members', async () => {
    const projections = app.get(IdpProjectionsFacade);
    const read = jest.spyOn(projections, 'getProjectMembers');
    const strict = jest.spyOn(projections, 'getProjectMembersOrThrow');
    const originalRead = read.getMockImplementation()!;
    const originalStrict = strict.getMockImplementation()!;
    const members = await originalStrict(admin.projectId);
    const removed = new ProjectMemberDto(
      'removed',
      'former@example.test',
      'Former member',
      undefined,
      'editor',
      false,
      true
    );
    read.mockResolvedValue([...members, removed]);
    strict.mockResolvedValue([...members, removed]);
    try {
      const context = await contexts.createContext(admin, { name: 'Active members' });
      await contexts.setContextMembers(admin, { contextId: context.id, assignedUserIds: ['1'] });
      const client = await connectMcp();
      const listed = await client.callTool({ name: 'list_project_members', arguments: {} });
      expect(listed.isError).not.toBe(true);
      expect(listed.structuredContent).toEqual({
        members: expect.not.arrayContaining([expect.objectContaining({ user_id: 'removed' })]),
      });
      const assigned = await client.callTool({
        name: 'set_context_members',
        arguments: { context_id: context.id, assigned_user_ids: ['removed'] },
      });
      expect(assigned.isError).toBe(true);
      expect(assigned.content).toEqual([
        { type: 'text', text: 'User IDs are not members of this project: removed' },
      ]);
      expect(
        await app.get(ContextAccessService).getMemberContextIds('1', admin.projectId)
      ).toContain(context.id);
    } finally {
      read.mockImplementation(originalRead);
      strict.mockImplementation(originalStrict);
    }
  });

  it('returns stored icon keys and empty descriptions when listing and updating Contexts through the SDK', async () => {
    const context = await contexts.createContext(admin, {
      name: 'Stored metadata',
      description: '',
    });
    const repository = app.get<Repository<Context>>(getRepositoryToken(Context));
    await repository.update(context.id, { icon: 'retired-icon' as DataMartIconValue });
    const client = await connectMcp();
    const listed = await client.callTool({ name: 'list_contexts', arguments: {} });
    expect(listed.isError).not.toBe(true);
    expect(listed.structuredContent).toMatchObject({
      contexts: expect.arrayContaining([
        expect.objectContaining({ id: context.id, description: '', icon: 'retired-icon' }),
      ]),
    });
    const updated = await client.callTool({
      name: 'update_context_metadata',
      arguments: { context_id: context.id, name: 'Renamed' },
    });
    expect(updated.isError).not.toBe(true);
    expect(updated.structuredContent).toMatchObject({
      id: context.id,
      name: 'Renamed',
      description: '',
      icon: 'retired-icon',
    });
  });

  it('preserves a metadata field changed after the Context was loaded', async () => {
    const context = await contexts.createContext(admin, {
      name: 'Interleaved metadata',
      description: 'Original',
    });
    const repository = app.get<Repository<Context>>(getRepositoryToken(Context));
    const find = repository.findOne.bind(repository);
    const lookup = jest.spyOn(repository, 'findOne').mockImplementationOnce(async options => {
      const stale = await find(options);
      await repository.update(context.id, { description: 'Saved by another update' });
      return stale;
    });
    try {
      const client = await connectMcp();
      const result = await client.callTool({
        name: 'update_context_metadata',
        arguments: { context_id: context.id, icon: 'purchases' },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        description: 'Saved by another update',
        icon: 'purchases',
      });
      expect(await find({ where: { id: context.id } })).toMatchObject({
        description: 'Saved by another update',
        icon: 'purchases',
      });
    } finally {
      lookup.mockRestore();
    }
  });

  it('keeps explicit assignments when a member has not yet loaded their default scope', async () => {
    const defaults = app.get(UserProvisioningContextSettingsService);
    const access = app.get(ContextAccessService);
    const defaultContext = await contexts.createContext(admin, { name: 'Default Context' });
    const assignedContext = await contexts.createContext(admin, { name: 'Explicit Context' });
    await access.removeMemberBindings('2', admin.projectId);
    await defaults.saveDefaultSettings(admin.projectId, {
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: [defaultContext.id],
    });
    try {
      const client = await connectMcp();
      const assigned = await client.callTool({
        name: 'set_context_members',
        arguments: { context_id: assignedContext.id, assigned_user_ids: ['2'] },
      });
      expect(assigned.isError).not.toBe(true);
      const listed = await client.callTool({ name: 'list_project_members', arguments: {} });
      expect(listed.isError).not.toBe(true);
      expect(listed.structuredContent).toMatchObject({
        members: expect.arrayContaining([
          expect.objectContaining({
            user_id: '2',
            context_ids: expect.arrayContaining([defaultContext.id, assignedContext.id]),
          }),
        ]),
      });
    } finally {
      await defaults.saveDefaultSettings(admin.projectId, {
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: [],
      });
      for (const userId of ['0', '1', '2'])
        await access.removeMemberBindings(userId, admin.projectId);
    }
  });

  it('allows discovery but refuses every setup write for a read-only MCP token', async () => {
    const context = await contexts.createContext(admin, {
      name: 'Read-only setup',
      description: 'Keep Context notes',
    });
    await contexts.setContextMembers(admin, { contextId: context.id, assignedUserIds: ['1'] });
    await settings.updateDescription(admin.projectId, { description: 'Keep project notes' });
    const before = await contexts.listContexts(admin.projectId);
    currentScopes = ['mcp:read'];
    const client = await connectMcp();
    try {
      for (const call of [
        { name: 'list_contexts', arguments: {} },
        { name: 'list_project_members', arguments: {} },
        { name: 'get_project_settings', arguments: {} },
        { name: 'get_context_impact', arguments: { context_id: context.id } },
      ]) {
        expect((await client.callTool(call)).isError).not.toBe(true);
      }
      for (const call of [
        { name: 'create_context', arguments: { name: 'Forbidden create' } },
        {
          name: 'update_context_metadata',
          arguments: { context_id: context.id, description: null },
        },
        {
          name: 'set_context_members',
          arguments: { context_id: context.id, assigned_user_ids: [] },
        },
        { name: 'delete_context', arguments: { context_id: context.id } },
        { name: 'update_project_description', arguments: { description: null } },
      ]) {
        const denied = await client.callTool(call);
        expect(denied.isError).toBe(true);
        expect(denied.content).toEqual([{ type: 'text', text: 'Missing MCP scope: mcp:write' }]);
      }
      expect(await contexts.listContexts(admin.projectId)).toEqual(before);
      expect(await settings.getSettings(admin.projectId)).toMatchObject({
        description: 'Keep project notes',
      });
      expect(
        await app.get(ContextAccessService).getMemberContextIds('1', admin.projectId)
      ).toContain(context.id);
    } finally {
      currentScopes = ['mcp:read', 'mcp:write'];
      await contexts.setContextMembers(admin, { contextId: context.id, assignedUserIds: [] });
      await contexts.deleteContext(admin, { contextId: context.id });
    }
  });

  it('keeps persisted assignments when an SDK call includes a non-member', async () => {
    const context = await contexts.createContext(admin, { name: 'Invalid member assignment' });
    await contexts.setContextMembers(admin, { contextId: context.id, assignedUserIds: ['1'] });
    const client = await connectMcp();
    try {
      const denied = await client.callTool({
        name: 'set_context_members',
        arguments: { context_id: context.id, assigned_user_ids: ['2', 'foreign-member'] },
      });
      expect(denied.isError).toBe(true);
      expect(denied.content).toEqual([
        { type: 'text', text: 'User IDs are not members of this project: foreign-member' },
      ]);
      const access = app.get(ContextAccessService);
      expect(await access.getMemberContextIds('1', admin.projectId)).toContain(context.id);
      expect(await access.getMemberContextIds('2', admin.projectId)).not.toContain(context.id);
      expect(await contexts.getContextImpact(admin, { contextId: context.id })).toMatchObject({
        memberCount: 1,
      });
    } finally {
      await contexts.setContextMembers(admin, { contextId: context.id, assignedUserIds: [] });
      await contexts.deleteContext(admin, { contextId: context.id });
    }
  });

  it('lists persisted built-in and Lucide icons and null after clearing through the MCP SDK', async () => {
    const created = await agent
      .post('/api/contexts')
      .set(AUTH_HEADER)
      .send({ name: 'Context icon discovery', icon: 'purchases' })
      .expect(201);
    const id: string = created.body.id;
    const client = await connectMcp();
    try {
      const initial = await client.callTool({ name: 'list_contexts', arguments: {} });
      expect(initial.isError).not.toBe(true);
      expect(initial.structuredContent).toMatchObject({
        contexts: expect.arrayContaining([expect.objectContaining({ id, icon: 'purchases' })]),
      });

      for (const icon of ['lucide:megaphone', null]) {
        const updated = await client.callTool({
          name: 'update_context_metadata',
          arguments: { context_id: id, icon },
        });
        expect(updated.isError).not.toBe(true);
        expect(updated.structuredContent).toMatchObject({ id, icon });

        const listed = await client.callTool({ name: 'list_contexts', arguments: {} });
        expect(listed.isError).not.toBe(true);
        expect(listed.structuredContent).toMatchObject({
          contexts: expect.arrayContaining([expect.objectContaining({ id, icon })]),
        });
      }
    } finally {
      await contexts.deleteContext(admin, { contextId: id });
    }
  });

  it('round-trips omitted descriptions and explicit null between REST and MCP', async () => {
    const client = await connectMcp();
    const created = await agent
      .post('/api/contexts')
      .set(AUTH_HEADER)
      .send({ name: 'REST Context', description: 'Keep Context notes', icon: 'purchases' })
      .expect(201);
    const id: string = created.body.id;
    const unchanged = await agent
      .put(`/api/contexts/${id}`)
      .set(AUTH_HEADER)
      .send({ name: 'REST Context renamed' })
      .expect(200);
    expect(unchanged.body).toMatchObject({ description: 'Keep Context notes', icon: 'purchases' });
    await agent
      .put(`/api/contexts/${id}`)
      .set(AUTH_HEADER)
      .send({ name: 'REST Context renamed', description: null })
      .expect(200);
    const listed = await client.callTool({ name: 'list_contexts', arguments: {} });
    expect(listed.isError).not.toBe(true);
    expect(listed.structuredContent).toMatchObject({
      contexts: expect.arrayContaining([
        expect.objectContaining({ id, description: null, icon: 'purchases' }),
      ]),
    });
    const updated = await client.callTool({
      name: 'update_context_metadata',
      arguments: { context_id: id, description: 'MCP notes' },
    });
    expect(updated.isError).not.toBe(true);
    const reread = await agent.get('/api/contexts').set(AUTH_HEADER).expect(200);
    expect(reread.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id,
          name: 'REST Context renamed',
          description: 'MCP notes',
          icon: 'purchases',
        }),
      ])
    );
  });

  it('requires a project description and round-trips normalization and null between REST and MCP', async () => {
    const client = await connectMcp();
    const saved = await agent
      .put('/api/projects/settings/description')
      .set(AUTH_HEADER)
      .send({ description: '  Project notes  ' })
      .expect(200);
    expect(saved.body.description).toBe('Project notes');
    await agent.put('/api/projects/settings/description').set(AUTH_HEADER).send({}).expect(400);
    const invalid = await client.callTool({ name: 'update_project_description', arguments: {} });
    expect(invalid.isError).toBe(true);
    currentRoles = ['viewer'];
    const read = await client.callTool({ name: 'get_project_settings', arguments: {} });
    expect(read.isError).not.toBe(true);
    expect(read.structuredContent).toEqual({ description: 'Project notes' });

    currentRoles = ['admin'];
    for (const [description, expected] of [
      [null, null],
      ['  MCP project notes  ', 'MCP project notes'],
    ] as const) {
      const updated = await client.callTool({
        name: 'update_project_description',
        arguments: { description },
      });
      expect(updated.isError).not.toBe(true);
      expect(updated.structuredContent).toEqual({ description: expected });
      const reread = await agent.get('/api/projects/settings').set(AUTH_HEADER).expect(200);
      expect(reread.body.description).toBe(expected);
    }
    await agent
      .put('/api/projects/settings/description')
      .set(AUTH_HEADER)
      .send({ description: null })
      .expect(200);
    const cleared = await client.callTool({ name: 'get_project_settings', arguments: {} });
    expect(cleared.isError).not.toBe(true);
    expect(cleared.structuredContent).toEqual({ description: null });
  });

  it('lets a viewer discover member IDs and an admin persist Context assignments with those IDs', async () => {
    currentRoles = ['viewer'];
    const client = await connectMcp();
    const listed = await client.callTool({ name: 'list_project_members', arguments: {} });
    expect(listed.isError).not.toBe(true);
    const { members } = z
      .object({
        members: z.array(z.object({ user_id: z.string(), email: z.string() })),
      })
      .parse(listed.structuredContent);
    expect(members).toHaveLength(3);
    const memberId = members.find(member => member.email === 'editor@example.test')!.user_id;
    expect(memberId).toBe('1');
    const context = await contexts.createContext(admin, { name: 'Member discovery' });
    const access = app.get(ContextAccessService);
    await access.updateMemberRoleScope(memberId, admin.projectId, RoleScope.SELECTED_CONTEXTS);
    try {
      currentRoles = ['admin'];
      const assigned = await client.callTool({
        name: 'set_context_members',
        arguments: { context_id: context.id, assigned_user_ids: [memberId] },
      });
      expect(assigned.isError).not.toBe(true);
      expect(assigned.structuredContent).toEqual({
        assigned_user_ids: [memberId],
        dropped_admin_ids: [],
      });
      currentRoles = ['viewer'];
      const reread = await client.callTool({ name: 'list_project_members', arguments: {} });
      expect(reread.isError).not.toBe(true);
      expect(reread.structuredContent).toEqual({
        members: expect.arrayContaining([
          {
            user_id: memberId,
            email: 'editor@example.test',
            display_name: 'Data Owner',
            avatar_url: null,
            role: 'editor',
            role_scope: 'selected_contexts',
            context_ids: [context.id],
          },
        ]),
      });
    } finally {
      await access.updateMember(memberId, admin.projectId, {
        role: ProjectRole.EDITOR,
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: [],
      });
    }
  });

  it('reports attachments and refuses deletion until members are detached', async () => {
    const context = await contexts.createContext(admin, { name: 'Deletion lifecycle' });
    const client = await connectMcp();
    const input = { context_id: context.id };
    const assigned = await client.callTool({
      name: 'set_context_members',
      arguments: { ...input, assigned_user_ids: ['0', '2'] },
    });
    expect(assigned.isError).not.toBe(true);
    expect(assigned.structuredContent).toEqual({
      assigned_user_ids: ['2'],
      dropped_admin_ids: ['0'],
    });
    const impact = await client.callTool({ name: 'get_context_impact', arguments: input });
    expect(impact.isError).not.toBe(true);
    expect(impact.structuredContent).toMatchObject({ context_id: context.id, member_count: 1 });
    const blocked = await client.callTool({ name: 'delete_context', arguments: input });
    expect(blocked.isError).toBe(true);
    expect(blocked.content).toEqual([
      {
        type: 'text',
        text: 'Context is attached to resources, members, or user provisioning defaults. Detach it from all Data Marts, Storages, Destinations, Members and User Provisioning settings before deleting.',
      },
    ]);
    expect(await contexts.listContexts(admin.projectId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: context.id })])
    );

    const detached = await client.callTool({
      name: 'set_context_members',
      arguments: { ...input, assigned_user_ids: [] },
    });
    expect(detached.isError).not.toBe(true);
    const emptyImpact = await client.callTool({ name: 'get_context_impact', arguments: input });
    expect(emptyImpact.isError).not.toBe(true);
    expect(emptyImpact.structuredContent).toMatchObject({ member_count: 0 });
    const deleted = await client.callTool({ name: 'delete_context', arguments: input });
    expect(deleted.isError).not.toBe(true);
    expect(deleted.structuredContent).toEqual({ context_id: context.id, status: 'deleted' });
    expect(await contexts.listContexts(admin.projectId)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: context.id })])
    );
    const missing = await client.callTool({ name: 'get_context_impact', arguments: input });
    expect(missing.isError).toBe(true);
    expect(missing.content).toEqual([
      {
        type: 'text',
        text: `Context with id ${context.id} not found in project ${admin.projectId}`,
      },
    ]);
  });

  it('rejects Context IDs outside the authenticated project without changing them', async () => {
    const context = await contexts.createContext(admin, {
      name: 'Project boundary',
      description: 'Keep',
    });
    currentProjectId = 'other-project';
    const client = await connectMcp();
    const input = { context_id: context.id };
    for (const call of [
      { name: 'update_context_metadata', arguments: { ...input, name: 'Forbidden' } },
      { name: 'get_context_impact', arguments: input },
      { name: 'delete_context', arguments: input },
      { name: 'set_context_members', arguments: { ...input, assigned_user_ids: [] } },
    ]) {
      const denied = await client.callTool(call);
      expect(denied.isError).toBe(true);
      expect(denied.content).toEqual([
        {
          type: 'text',
          text: `Context with id ${context.id} not found in project other-project`,
        },
      ]);
    }
    expect(await contexts.listContexts(admin.projectId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: context.id, name: 'Project boundary', description: 'Keep' }),
      ])
    );
  });

  it('persists partial Context metadata, preserves omitted fields and only clears explicit nulls', async () => {
    const client = await connectMcp();
    const created = await client.callTool({
      name: 'create_context',
      arguments: { name: 'Metadata Context', description: 'Keep goals', icon: 'lucide:megaphone' },
    });
    expect(created.isError).not.toBe(true);
    const { id } = z.object({ id: z.string() }).parse(created.structuredContent);
    const target = { context_id: id };
    for (const [patch, expected] of [
      [
        { icon: 'lucide:grid-2x2-check' },
        { name: 'Metadata Context', description: 'Keep goals', icon: 'lucide:grid-2x2-check' },
      ],
      [
        { description: 'New goals' },
        { name: 'Metadata Context', description: 'New goals', icon: 'lucide:grid-2x2-check' },
      ],
      [
        { name: 'Metadata renamed' },
        { name: 'Metadata renamed', description: 'New goals', icon: 'lucide:grid-2x2-check' },
      ],
      [
        { description: null, icon: null },
        { name: 'Metadata renamed', description: null, icon: null },
      ],
    ] as const) {
      const updated = await client.callTool({
        name: 'update_context_metadata',
        arguments: { ...target, ...patch },
      });
      expect(updated.isError).not.toBe(true);
      expect(updated.structuredContent).toMatchObject({ id, ...expected });
      const reread = await agent.get('/api/contexts').set(AUTH_HEADER).expect(200);
      expect(reread.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id, ...expected })])
      );
    }

    const duplicate = await contexts.createContext(admin, { name: 'Existing metadata name' });
    const conflict = await client.callTool({
      name: 'update_context_metadata',
      arguments: { ...target, name: duplicate.name, description: 'Must not persist' },
    });
    expect(conflict.isError).toBe(true);
    expect(conflict.content).toEqual([
      {
        type: 'text',
        text: `Context with name "${duplicate.name}" already exists in this project`,
      },
    ]);
    for (const patch of [{ name: 'Must not persist', icon: 'invalid' }, {}]) {
      const invalid = await client.callTool({
        name: 'update_context_metadata',
        arguments: { ...target, ...patch },
      });
      expect(invalid.isError).toBe(true);
    }
    await agent.put(`/api/contexts/${id}`).set(AUTH_HEADER).send({ icon: 'purchases' }).expect(400);
    const unchanged = await agent.get('/api/contexts').set(AUTH_HEADER).expect(200);
    expect(unchanged.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, name: 'Metadata renamed', description: null, icon: null }),
      ])
    );
  });
});
