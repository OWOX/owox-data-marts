import { INestApplication, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AUTH_HEADER, StorageBuilder, closeTestApp, createTestApp } from '@owox/test-utils';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { UserProjectionDto } from '../src/idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../src/idp/dto/domain/user-projections-list.dto';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import { ProjectRole } from '../src/data-marts/enums/project-role.enum';
import { RoleScope } from '../src/data-marts/enums/role-scope.enum';
import { ContextAccessService } from '../src/data-marts/services/context/context-access.service';
import { DataMartService } from '../src/data-marts/services/data-mart.service';
import { DataMartDefinitionType } from '../src/data-marts/enums/data-mart-definition-type.enum';
import { DataMartIcon } from '../src/data-marts/enums/data-mart-icon.enum';
import { z } from 'zod-v4';
import { DataMartSchemaSchema } from '../src/data-marts/data-storage-types/data-mart-schema.type';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { makeMcpOutputSchema } from '../src/ee/mcp/sdk/mcp-output-schema';
import { GetDataMartConfigurationTool } from '../src/ee/mcp/tools/data-mart/get-data-mart-configuration.tool';
import { UpdateDataMartMetadataTool } from '../src/ee/mcp/tools/data-mart/update-data-mart-metadata.tool';
import { UpdateDataMartBlendedFieldsConfigTool } from '../src/ee/mcp/tools/data-mart/update-data-mart-blended-fields-config.tool';
import { UpdateProjectDescriptionTool } from '../src/ee/mcp/tools/project/update-project-description.tool';
import { UpdateDataMartRelationshipTool } from '../src/ee/mcp/tools/data-mart/update-data-mart-relationship.tool';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../src/data-marts/facades/mcp-data-mart-setup.facade';
import {
  MCP_DATA_MART_RELATIONSHIPS_FACADE,
  type McpDataMartRelationshipsFacade,
} from '../src/data-marts/facades/mcp-data-mart-relationships.facade';
import {
  MCP_CONTEXTS_FACADE,
  type McpContextsFacade,
} from '../src/data-marts/facades/mcp-contexts.facade';
import {
  PROJECT_SETTINGS_FACADE,
  type ProjectSettingsFacade,
} from '../src/project-settings/facades/project-settings.facade';
import { CreateContextTool } from '../src/ee/mcp/tools/context/create-context.tool';
import { UpdateContextTool } from '../src/ee/mcp/tools/context/update-context.tool';
import { SetContextMembersTool } from '../src/ee/mcp/tools/context/set-context-members.tool';
import { ListProjectMembersTool } from '../src/ee/mcp/tools/project/list-project-members.tool';
import type { McpAuthContext } from '../src/ee/mcp/auth/mcp-auth-context';
import { UpdateAvailabilityService } from '../src/data-marts/use-cases/update-availability.service';

describe('MCP configuration with real persistence and access decisions', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let setup: McpDataMartSetupFacade;
  let contexts: McpContextsFacade;
  let relationships: McpDataMartRelationshipsFacade;
  let settings: ProjectSettingsFacade;
  let storageId: string;
  const admin: McpAuthContext = {
    clientId: 'test',
    projectId: '0',
    userId: '0',
    roles: ['admin'],
    scopes: ['mcp:read', 'mcp:write'],
    resource: 'https://mcp.example/mcp',
    authFlow: 'mcp',
  };
  const editor: McpAuthContext = { ...admin, userId: '1', roles: ['editor'] };
  const viewer: McpAuthContext = { ...admin, userId: '2', roles: ['viewer'] };
  const createMart = (title = 'Revenue') => setup.createDataMart(editor, { title, storageId });

  beforeAll(async () => {
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
    setup = app.get(MCP_DATA_MART_SETUP_FACADE);
    contexts = app.get(MCP_CONTEXTS_FACADE);
    relationships = app.get(MCP_DATA_MART_RELATIONSHIPS_FACADE);
    settings = app.get(PROJECT_SETTINGS_FACADE);
    const storage = await testApp.agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().build())
      .expect(201);
    storageId = storage.body.id;
  }, 120000);

  afterAll(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
    if (app) await closeTestApp(app);
  });

  it('preserves an omitted REST description in the response and database, and clears explicit null across REST and MCP', async () => {
    const mart = await createMart();
    const tool = app.get(UpdateDataMartMetadataTool);
    await tool.handler({ data_mart_id: mart.id, description: 'Keep these notes' }, editor);

    const unchanged = await agent
      .put(`/api/data-marts/${mart.id}/description`)
      .set(AUTH_HEADER)
      .send({})
      .expect(200);
    expect(unchanged.body.description).toBe('Keep these notes');
    const persisted = await agent.get(`/api/data-marts/${mart.id}`).set(AUTH_HEADER).expect(200);
    expect(persisted.body.description).toBe('Keep these notes');

    const cleared = await agent
      .put(`/api/data-marts/${mart.id}/description`)
      .set(AUTH_HEADER)
      .send({ description: null })
      .expect(200);
    expect(cleared.body.description).toBeNull();
    expect((await setup.getDataMart(editor, { dataMartId: mart.id })).description).toBeNull();

    await agent
      .put(`/api/data-marts/${mart.id}/description`)
      .set(AUTH_HEADER)
      .send({ description: 'REST notes' })
      .expect(200);
    await tool.handler({ data_mart_id: mart.id, title: 'Renamed through MCP' }, editor);
    const renamed = await agent.get(`/api/data-marts/${mart.id}`).set(AUTH_HEADER).expect(200);
    expect(renamed.body).toMatchObject({ title: 'Renamed through MCP', description: 'REST notes' });
    await tool.handler({ data_mart_id: mart.id, description: null }, editor);
    const reread = await agent.get(`/api/data-marts/${mart.id}`).set(AUTH_HEADER).expect(200);
    expect(reread.body.description).toBeNull();
  });

  it('preserves omitted REST blended configuration and persists explicit null from either interface', async () => {
    const mart = await createMart();
    const tool = app.get(UpdateDataMartBlendedFieldsConfigTool);
    const config = { sources: [{ path: 'orders', alias: 'Orders' }] };
    await tool.handler({ data_mart_id: mart.id, blended_fields_config: config }, editor);

    const unchanged = await agent
      .put(`/api/data-marts/${mart.id}/blended-fields-config`)
      .set(AUTH_HEADER)
      .send({})
      .expect(200);
    expect(unchanged.body.blendedFieldsConfig).toEqual(config);
    expect((await setup.getDataMart(editor, { dataMartId: mart.id })).blendedFieldsConfig).toEqual(
      config
    );

    await agent
      .put(`/api/data-marts/${mart.id}/blended-fields-config`)
      .set(AUTH_HEADER)
      .send({ blendedFieldsConfig: null })
      .expect(200);
    expect(
      (await setup.getDataMart(editor, { dataMartId: mart.id })).blendedFieldsConfig
    ).toBeNull();

    await agent
      .put(`/api/data-marts/${mart.id}/blended-fields-config`)
      .set(AUTH_HEADER)
      .send({ blendedFieldsConfig: config })
      .expect(200);
    expect(() => tool.parseInput({ data_mart_id: mart.id })).toThrow();
    expect((await setup.getDataMart(editor, { dataMartId: mart.id })).blendedFieldsConfig).toEqual(
      config
    );
    await tool.handler({ data_mart_id: mart.id, blended_fields_config: null }, editor);
    const reread = await agent.get(`/api/data-marts/${mart.id}`).set(AUTH_HEADER).expect(200);
    expect(reread.body).not.toHaveProperty('blendedFieldsConfig');
  });

  it('requires explicit REST icon resets and rejects missing or null titles without changing metadata', async () => {
    const mart = await createMart();
    const tool = app.get(UpdateDataMartMetadataTool);
    await tool.handler({ data_mart_id: mart.id, icon: DataMartIcon.PURCHASES }, editor);
    await agent.put(`/api/data-marts/${mart.id}/icon`).set(AUTH_HEADER).send({}).expect(400);
    for (const body of [{}, { title: null }]) {
      await agent.put(`/api/data-marts/${mart.id}/title`).set(AUTH_HEADER).send(body).expect(400);
    }
    expect(() => tool.parseInput({ data_mart_id: mart.id, title: null })).toThrow();
    expect(() => tool.parseInput({ data_mart_id: mart.id })).toThrow();
    expect(await setup.getDataMart(editor, { dataMartId: mart.id })).toMatchObject({
      title: 'Revenue',
      icon: 'purchases',
    });
    const cleared = await agent
      .put(`/api/data-marts/${mart.id}/icon`)
      .set(AUTH_HEADER)
      .send({ icon: null })
      .expect(200);
    expect(cleared.body.icon).toBeNull();
    expect((await setup.getDataMart(editor, { dataMartId: mart.id })).icon).toBeNull();
  });

  it.each([{}, { description: null }])(
    'accepts empty Context descriptions through REST and MCP: %j',
    async input => {
      const name = `Empty Context ${JSON.stringify(input)}`;
      const created = await agent
        .post('/api/contexts')
        .set(AUTH_HEADER)
        .send({ name, ...input })
        .expect(201);
      expect(created.body.description).toBeNull();
      const create = app.get(CreateContextTool);
      const result = await create.handler({ name: `${name} MCP`, ...input }, admin);
      expect(result.structuredContent).toMatchObject({ description: null });
    }
  );

  it('preserves omitted REST Context descriptions and round-trips null clearing with MCP', async () => {
    const created = await agent
      .post('/api/contexts')
      .set(AUTH_HEADER)
      .send({ name: 'REST Context', description: 'Keep Context notes' })
      .expect(201);
    const id: string = created.body.id;
    const unchanged = await agent
      .put(`/api/contexts/${id}`)
      .set(AUTH_HEADER)
      .send({ name: 'REST Context renamed' })
      .expect(200);
    expect(unchanged.body.description).toBe('Keep Context notes');
    await agent
      .put(`/api/contexts/${id}`)
      .set(AUTH_HEADER)
      .send({ name: 'REST Context renamed', description: null })
      .expect(200);
    expect(
      (await contexts.listContexts(admin.projectId)).find(item => item.id === id)?.description
    ).toBeNull();
    const update = app.get(UpdateContextTool);
    await update.handler({ context_id: id, name: 'MCP Context', description: 'MCP notes' }, admin);
    const omitted = await update.handler({ context_id: id, name: 'MCP Context renamed' }, admin);
    expect(omitted.structuredContent).toMatchObject({ description: 'MCP notes' });
    await update.handler({ context_id: id, name: 'MCP Context renamed', description: null }, admin);
    const reread = await agent.get('/api/contexts').set(AUTH_HEADER).expect(200);
    expect(reread.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, description: null })])
    );
  });

  it('requires a project description field and round-trips normalization and clearing between REST and MCP', async () => {
    const tool = app.get(UpdateProjectDescriptionTool);
    const saved = await agent
      .put('/api/projects/settings/description')
      .set(AUTH_HEADER)
      .send({ description: '  Project notes  ' })
      .expect(200);
    expect(saved.body.description).toBe('Project notes');
    expect(() => tool.parseInput({})).toThrow();
    await agent.put('/api/projects/settings/description').set(AUTH_HEADER).send({}).expect(400);
    expect((await settings.getSettings(viewer)).description).toBe('Project notes');
    await tool.handler({ description: null }, admin);
    const cleared = await agent.get('/api/projects/settings').set(AUTH_HEADER).expect(200);
    expect(cleared.body.description).toBeNull();
    await tool.handler({ description: '  MCP project notes  ' }, admin);
    const normalized = await agent.get('/api/projects/settings').set(AUTH_HEADER).expect(200);
    expect(normalized.body.description).toBe('MCP project notes');
    await agent
      .put('/api/projects/settings/description')
      .set(AUTH_HEADER)
      .send({ description: null })
      .expect(200);
    expect((await settings.getSettings(viewer)).description).toBeNull();
  });

  it('clears blended overrides durably when null is supplied', async () => {
    const mart = await createMart();
    await setup.updateDataMartBlendedFieldsConfig(editor, {
      dataMartId: mart.id,
      blendedFieldsConfig: { sources: [{ path: 'orders', alias: 'Orders' }] },
    });
    await setup.updateDataMartBlendedFieldsConfig(editor, {
      dataMartId: mart.id,
      blendedFieldsConfig: null,
    });
    expect(
      (await setup.getDataMart(editor, { dataMartId: mart.id })).blendedFieldsConfig
    ).toBeNull();
  });

  it('returns persisted warehouse metadata through the advertised configuration output contract', async () => {
    const mart = await createMart('Typed configuration output');
    const service = app.get(DataMartService);
    const entity = await service.getByIdAndProjectId(mart.id, editor.projectId);
    entity.definitionType = DataMartDefinitionType.SQL;
    entity.definition = { sqlQuery: 'SELECT country FROM orders' };
    entity.schema = DataMartSchemaSchema.parse({
      type: 'bigquery-data-mart-schema',
      fields: [
        { name: 'country', type: 'STRING', mode: 'REQUIRED', futureMetadata: { keep: true } },
      ],
    });
    await service.save(entity);
    const tool = app.get(GetDataMartConfigurationTool);
    const result = await tool.handler({ data_mart_id: mart.id }, editor);
    const json = makeMcpOutputSchema(tool.outputSchema)['~standard'].jsonSchema.output({
      target: 'draft-2020-12',
    });
    expect(new AjvJsonSchemaValidator().getValidator(json)(result.structuredContent).valid).toBe(
      true
    );
    expect(result.structuredContent).toMatchObject({
      data_mart: {
        id: mart.id,
        definitionType: 'SQL',
        definition: { sqlQuery: 'SELECT country FROM orders' },
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'country',
              type: 'STRING',
              mode: 'REQUIRED',
              status: 'DISCONNECTED',
              futureMetadata: { keep: true },
            },
          ],
        },
      },
    });
  });

  it('lists project members for a viewer and uses their IDs for persisted Context assignments', async () => {
    const tool = app.get(ListProjectMembersTool);
    const listed = await tool.handler({}, viewer);
    const { members } = z.object(tool.outputSchema).parse(listed.structuredContent);
    expect(members).toHaveLength(3);
    const memberId = members.find(member => member.email === 'editor@example.test')!.user_id;
    expect(memberId).toBe('1');
    const context = await contexts.createContext(admin, { name: 'Member discovery' });
    const access = app.get(ContextAccessService);
    await access.updateMemberRoleScope(memberId, admin.projectId, RoleScope.SELECTED_CONTEXTS);
    try {
      const assigned = await app
        .get(SetContextMembersTool)
        .handler({ context_id: context.id, assigned_user_ids: [memberId] }, admin);
      expect(assigned.structuredContent).toEqual({
        assigned_user_ids: [memberId],
        dropped_admin_ids: [],
      });
      expect((await tool.handler({}, viewer)).structuredContent).toEqual({
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

  it('returns the persisted Context description when an update omits it', async () => {
    const create = app.get(CreateContextTool);
    const created = await create.handler(
      { name: 'Sales', description: 'Keep this description' },
      admin
    );
    const { id } = z.object(create.outputSchema).parse(created.structuredContent);
    const updated = await app
      .get(UpdateContextTool)
      .handler({ context_id: id, name: 'Sales renamed' }, admin);
    expect(updated.structuredContent).toMatchObject({
      id,
      name: 'Sales renamed',
      description: 'Keep this description',
    });
    expect(
      (await contexts.listContexts(admin.projectId)).find(item => item.id === id)?.description
    ).toBe('Keep this description');
    await app
      .get(UpdateContextTool)
      .handler({ context_id: id, name: 'Sales renamed', description: null }, admin);
    expect(
      (await contexts.listContexts(admin.projectId)).find(item => item.id === id)?.description
    ).toBeNull();
  });

  it('supports draft edits while keeping the actual owner in the returned configuration', async () => {
    const mart = await createMart();
    const result = await setup.updateDataMartMetadata(editor, {
      dataMartId: mart.id,
      title: 'Net revenue',
    });
    expect(result).toMatchObject({
      id: mart.id,
      title: 'Net revenue',
      status: 'DRAFT',
      technicalOwnerIds: ['1'],
      storage: { id: storageId },
    });
  });

  it('persists combined metadata, preserves omitted fields and clears only explicit nulls', async () => {
    const mart = await createMart();
    const tool = app.get(UpdateDataMartMetadataTool);
    const updated = await tool.handler(
      {
        data_mart_id: mart.id,
        title: 'Net revenue',
        description: 'Notes',
        icon: DataMartIcon.PURCHASES,
      },
      editor
    );
    const json = makeMcpOutputSchema(tool.outputSchema)['~standard'].jsonSchema.output({
      target: 'draft-2020-12',
    });
    expect(new AjvJsonSchemaValidator().getValidator(json)(updated.structuredContent).valid).toBe(
      true
    );
    expect(updated.structuredContent).toMatchObject({
      data_mart: { title: 'Net revenue', description: 'Notes', icon: 'purchases' },
    });
    await tool.handler({ data_mart_id: mart.id, title: 'Gross revenue' }, editor);
    expect(await setup.getDataMart(editor, { dataMartId: mart.id })).toMatchObject({
      title: 'Gross revenue',
      description: 'Notes',
      icon: 'purchases',
    });
    await tool.handler({ data_mart_id: mart.id, description: null }, editor);
    expect(await setup.getDataMart(editor, { dataMartId: mart.id })).toMatchObject({
      title: 'Gross revenue',
      description: null,
      icon: 'purchases',
    });
    await tool.handler({ data_mart_id: mart.id, icon: null }, editor);
    expect(await setup.getDataMart(editor, { dataMartId: mart.id })).toMatchObject({
      title: 'Gross revenue',
      description: null,
      icon: null,
    });
  });

  it('rejects an invalid field in a combined metadata update before saving valid fields', async () => {
    const mart = await createMart('Unchanged title');
    await expect(
      app
        .get(UpdateDataMartMetadataTool)
        .handler(
          { data_mart_id: mart.id, title: 'Must not be saved', description: '€'.repeat(21846) },
          editor
        )
    ).rejects.toThrow('65535');
    expect((await setup.getDataMart(editor, { dataMartId: mart.id })).title).toBe(
      'Unchanged title'
    );
  });

  it('enforces role and resource permissions independently', async () => {
    await expect(
      setup.createDataMart(viewer, { title: 'Forbidden', storageId })
    ).rejects.toBeInstanceOf(ForbiddenException);
    const mart = await setup.createDataMart(admin, { title: 'Private admin mart', storageId });
    await setup.updateDataMartAvailability(admin, {
      dataMartId: mart.id,
      availableForReporting: false,
      availableForMaintenance: false,
    });
    await expect(
      setup.updateDataMartMetadata(editor, { dataMartId: mart.id, title: 'Forbidden' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      app.get(UpdateDataMartMetadataTool).handler({ data_mart_id: mart.id, icon: null }, viewer)
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      app
        .get(UpdateDataMartMetadataTool)
        .handler(
          { data_mart_id: mart.id, description: null },
          { ...admin, projectId: 'other-project' }
        )
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup.getDataMart(viewer, { dataMartId: mart.id })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect((await setup.getDataMart(admin, { dataMartId: mart.id })).title).toBe(
      'Private admin mart'
    );
  });

  it('filters creation candidates and rejects a storage without USE permission', async () => {
    const availability = app.get(UpdateAvailabilityService);
    await availability.updateStorageSharing(
      storageId,
      admin.projectId,
      admin.userId,
      admin.roles,
      false,
      false
    );
    try {
      expect(await setup.listDataStorages(editor)).toEqual([]);
      await expect(createMart('Forbidden storage use')).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await availability.updateStorageSharing(
        storageId,
        admin.projectId,
        admin.userId,
        admin.roles,
        true,
        false
      );
    }
  });

  it('does not assign Contexts to a Data Mart from another project', async () => {
    const mart = await createMart();
    const context = await contexts.createContext(admin, { name: 'Cross-project check' });
    await expect(
      setup.updateDataMartContexts(
        { ...admin, projectId: 'other' },
        { dataMartId: mart.id, contextIds: [context.id] }
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect((await setup.getDataMart(admin, { dataMartId: mart.id })).contexts).toEqual([]);
  });

  it('finishes an authorized owner removal even when it removes the caller access', async () => {
    const mart = await createMart();
    await setup.updateDataMartAvailability(editor, {
      dataMartId: mart.id,
      availableForReporting: false,
      availableForMaintenance: false,
    });
    const result = await setup.updateDataMartOwners(editor, {
      dataMartId: mart.id,
      businessOwnerIds: [],
      technicalOwnerIds: [],
    });
    expect(result.technicalOwnerIds).toEqual([]);
    await expect(setup.getDataMart(editor, { dataMartId: mart.id })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('keeps Context and project-description changes admin-only and stores normalized text', async () => {
    await expect(contexts.createContext(editor, { name: 'Forbidden' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(
      settings.updateDescription(editor, { description: 'Forbidden' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await settings.updateDescription(admin, { description: '  Reporting project  ' });
    expect(await settings.getSettings(viewer)).toMatchObject({ description: 'Reporting project' });
    await settings.updateDescription(admin, { description: null });
    expect(await settings.getSettings(viewer)).toMatchObject({ description: null });
  });

  it('preserves omitted relationship fields and clears descriptions across REST and MCP', async () => {
    const source = await createMart('Relationship source');
    const target = await createMart('Relationship target');
    const baseUrl = `/api/data-marts/${source.id}/relationships`;
    const created = await agent
      .post(baseUrl)
      .set(AUTH_HEADER)
      .send({
        targetDataMartId: target.id,
        targetAlias: 'orders',
        joinConditions: [],
        description: 'Relationship notes',
      })
      .expect(201);
    const relationshipId: string = created.body.id;
    const url = `${baseUrl}/${relationshipId}`;
    const omitted = await agent.patch(url).set(AUTH_HEADER).send({}).expect(200);
    expect(omitted.body).toMatchObject({
      targetAlias: 'orders',
      joinConditions: [],
      description: 'Relationship notes',
    });
    const tool = app.get(UpdateDataMartRelationshipTool);
    const unchanged = await tool.handler(
      { data_mart_id: source.id, relationship_id: relationshipId },
      editor
    );
    expect(unchanged.structuredContent).toMatchObject({
      relationship: { description: 'Relationship notes' },
    });
    await agent.patch(url).set(AUTH_HEADER).send({ description: null }).expect(200);
    const graph = await relationships.getRelationshipGraph({ ...editor, dataMartId: source.id });
    expect(graph.nodes[0].relationship.description).toBeUndefined();
    await tool.handler(
      { data_mart_id: source.id, relationship_id: relationshipId, description: 'Restored notes' },
      editor
    );
    const restored = await agent.get(`${baseUrl}/graph`).set(AUTH_HEADER).expect(200);
    expect(restored.body.nodes[0].relationship.description).toBe('Restored notes');
    await tool.handler(
      { data_mart_id: source.id, relationship_id: relationshipId, description: null },
      editor
    );
    const cleared = await agent.get(`${baseUrl}/graph`).set(AUTH_HEADER).expect(200);
    expect(cleared.body.nodes[0].relationship).not.toHaveProperty('description');
  });

  it('masks inaccessible relationship metadata after target sharing is revoked', async () => {
    const source = await createMart('Source');
    const target = await createMart('Private target');
    await relationships.createRelationship({
      ...editor,
      dataMartId: source.id,
      targetDataMartId: target.id,
      targetAlias: 'target',
      joinConditions: [],
    });
    await setup.updateDataMartAvailability(editor, {
      dataMartId: target.id,
      availableForReporting: false,
      availableForMaintenance: false,
    });
    await setup.updateDataMartOwners(editor, {
      dataMartId: target.id,
      businessOwnerIds: [],
      technicalOwnerIds: [],
    });
    const graph = await relationships.getRelationshipGraph({ ...editor, dataMartId: source.id });
    expect(graph.nodes[0].relationship.targetDataMart).toEqual({
      id: target.id,
      userHasAccess: false,
    });
  });
});
