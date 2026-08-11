import { ForbiddenException } from '@nestjs/common';
import type { ConnectorTestService } from '../services/connector/connector-test.service';
import type { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import {
  MCP_TEST_LOG_MAX_ENTRIES,
  MCP_TEST_LOG_MAX_ENTRY_CHARS,
  MCP_TEST_LOG_MAX_TOTAL_CHARS,
  McpConnectorAuthoringFacadeImpl,
} from './mcp-connector-authoring.facade.impl';

const base = { projectId: 'p1', userId: 'u1', roles: ['editor'] };

describe('McpConnectorAuthoringFacadeImpl.testConnector', () => {
  it('runs the connector test and maps rows/sample/error/logs (defaulting empty config)', async () => {
    const testService = {
      runTest: jest.fn().mockResolvedValue({
        rows: [{ id: 1 }],
        logs: ['ok'],
        error: null,
        sample: [{ raw: true }],
      }),
    } as unknown as ConnectorTestService;
    const facade = new McpConnectorAuthoringFacadeImpl(
      testService,
      {} as ConnectorDefinitionService
    );

    const res = await facade.testConnector({
      ...base,
      manifest: { nodes: { Repos: {} } },
      node: 'Repos',
      maxRows: 5,
    });

    expect(testService.runTest).toHaveBeenCalledWith({
      projectId: 'p1',
      manifest: { nodes: { Repos: {} } },
      node: 'Repos',
      configuration: {},
      maxRows: 5,
      maxPages: undefined,
    });
    expect(res).toEqual({ rows: [{ id: 1 }], sample: [{ raw: true }], error: null, logs: ['ok'] });
  });

  /**
   * The reason `logs` has to cross this boundary at all: a manifest whose recordPath
   * matches nothing completes with `rows: []` and `error: null`. Without the log trail an
   * assistant reads that as a passing test and publishes the connector; the diagnostic
   * naming the cause is the only thing that says otherwise.
   */
  it('carries the 0-record diagnostic that makes an empty, error-free result readable', async () => {
    const diagnostic =
      'Test produced 0 records: the request completed without error but ' +
      'recordSelector.recordPath matched no rows.';
    const testService = {
      runTest: jest
        .fn()
        .mockResolvedValue({ rows: [], logs: [diagnostic], error: null, sample: [{ raw: true }] }),
    } as unknown as ConnectorTestService;
    const facade = new McpConnectorAuthoringFacadeImpl(
      testService,
      {} as ConnectorDefinitionService
    );

    const res = await facade.testConnector({ ...base, manifest: {}, node: 'Repos' });

    expect(res.rows).toEqual([]);
    expect(res.error).toBeNull();
    expect(res.logs).toEqual([diagnostic]);
  });

  it('bounds the log trail it hands to an MCP client, keeping the newest entries', async () => {
    const logs = Array.from({ length: 500 }, (_, i) => `line ${i}`);
    logs.push('y'.repeat(MCP_TEST_LOG_MAX_ENTRY_CHARS * 5));
    const testService = {
      runTest: jest.fn().mockResolvedValue({ rows: [], logs, error: null, sample: [] }),
    } as unknown as ConnectorTestService;
    const facade = new McpConnectorAuthoringFacadeImpl(
      testService,
      {} as ConnectorDefinitionService
    );

    const res = await facade.testConnector({ ...base, manifest: {}, node: 'Repos' });

    // One omission notice plus at most the entry cap.
    expect(res.logs.length).toBeLessThanOrEqual(MCP_TEST_LOG_MAX_ENTRIES + 1);
    expect(res.logs.join('').length).toBeLessThanOrEqual(
      MCP_TEST_LOG_MAX_TOTAL_CHARS + res.logs[0].length
    );
    expect(res.logs[0]).toMatch(/earlier log line\(s\) omitted/);
    // The tail is what carries the failure, so it must survive — capped, not dropped.
    expect(res.logs.at(-1)).toMatch(/^y+… \[truncated\]$/);
    expect(res.logs.at(-1)!.length).toBeLessThanOrEqual(MCP_TEST_LOG_MAX_ENTRY_CHARS + 20);
    expect(res.logs).toContain('line 499');
  });
});

describe('McpConnectorAuthoringFacadeImpl.publishConnector', () => {
  /**
   * The create shape goes through the ATOMIC service call, not create() followed by
   * publish(). The manifest an assistant sends here has never been validated as a whole --
   * connector_test parses only the node it runs -- so a manifest the parser rejects used to
   * leave a committed connector that could not be published and whose name stayed reserved
   * for the life of the project. What that buys is asserted against a real transaction in
   * connector-definition-tables.migration.spec.ts; this pins the wiring.
   */
  it('creates and publishes as one operation when given name+title+manifest', async () => {
    const definitionService = {
      create: jest.fn(),
      publish: jest.fn(),
      createAndPublish: jest.fn().mockResolvedValue({
        definition: { id: 'def_1', name: 'Acme' },
        version: { version: 1, status: 'PUBLISHED' },
      }),
      getById: jest.fn(),
    } as unknown as ConnectorDefinitionService;
    const facade = new McpConnectorAuthoringFacadeImpl(
      {} as ConnectorTestService,
      definitionService
    );

    const res = await facade.publishConnector({
      ...base,
      name: 'Acme',
      title: 'Acme API',
      manifest: { source: {} },
    });

    expect(definitionService.createAndPublish).toHaveBeenCalledWith('p1', 'u1', {
      name: 'Acme',
      title: 'Acme API',
      manifest: { source: {} },
    });
    // The two-step path is what left orphans behind; neither half may be called on its own.
    expect(definitionService.create).not.toHaveBeenCalled();
    expect(definitionService.publish).not.toHaveBeenCalled();
    expect(res).toEqual({ connectorId: 'def_1', name: 'Acme', version: 1, status: 'PUBLISHED' });
  });

  it('publishes an existing draft when given only connectorId', async () => {
    const definitionService = {
      create: jest.fn(),
      publish: jest.fn().mockResolvedValue({ version: 2, status: 'PUBLISHED' }),
      getById: jest.fn().mockResolvedValue({ id: 'def_9', name: 'Existing' }),
    } as unknown as ConnectorDefinitionService;
    const facade = new McpConnectorAuthoringFacadeImpl(
      {} as ConnectorTestService,
      definitionService
    );

    const res = await facade.publishConnector({ ...base, connectorId: 'def_9' });

    expect(definitionService.create).not.toHaveBeenCalled();
    expect(definitionService.publish).toHaveBeenCalledWith('p1', 'def_9');
    expect(res).toEqual({
      connectorId: 'def_9',
      name: 'Existing',
      version: 2,
      status: 'PUBLISHED',
    });
  });
});

describe('publishConnector update branch', () => {
  it('saves the manifest as a draft then publishes it', async () => {
    const definitionService = {
      create: jest.fn(),
      saveDraft: jest.fn().mockResolvedValue({}),
      publish: jest.fn().mockResolvedValue({ version: 2, status: 'PUBLISHED' }),
      getById: jest.fn().mockResolvedValue({ id: 'def-1', name: 'CocCocAds' }),
    } as unknown as ConnectorDefinitionService;
    const facade = new McpConnectorAuthoringFacadeImpl(
      {} as ConnectorTestService,
      definitionService
    );

    const result = await facade.publishConnector({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connectorId: 'def-1',
      manifest: { version: '1.0', name: 'CocCocAds' },
    });

    expect(definitionService.saveDraft).toHaveBeenCalledWith('project-1', 'def-1', {
      version: '1.0',
      name: 'CocCocAds',
    });
    expect(definitionService.publish).toHaveBeenCalledWith('project-1', 'def-1');
    // The draft must be saved before publishing, or publish() would ship the
    // stale prior draft while the new manifest sits unpublished.
    expect((definitionService.saveDraft as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (definitionService.publish as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(definitionService.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ connectorId: 'def-1', name: 'CocCocAds', version: 2 });
  });

  it('does not save a draft when only connector_id is given', async () => {
    const definitionService = {
      create: jest.fn(),
      saveDraft: jest.fn(),
      publish: jest.fn().mockResolvedValue({ version: 1, status: 'PUBLISHED' }),
      getById: jest.fn().mockResolvedValue({ id: 'def-1', name: 'CocCocAds' }),
    } as unknown as ConnectorDefinitionService;
    const facade = new McpConnectorAuthoringFacadeImpl(
      {} as ConnectorTestService,
      definitionService
    );

    await facade.publishConnector({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connectorId: 'def-1',
    });

    expect(definitionService.saveDraft).not.toHaveBeenCalled();
  });
});

describe('deleteConnector', () => {
  const definitionService = {
    softDelete: jest.fn(),
  } as unknown as ConnectorDefinitionService;
  const facade = new McpConnectorAuthoringFacadeImpl({} as ConnectorTestService, definitionService);

  it('delegates to the guarded service delete', async () => {
    const softDelete = jest.spyOn(definitionService, 'softDelete').mockResolvedValue(undefined);

    const result = await facade.deleteConnector({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connectorId: 'def-1',
    });

    expect(softDelete).toHaveBeenCalledWith('project-1', 'def-1');
    expect(result).toEqual({ connectorId: 'def-1', deleted: true });
  });

  it('propagates the in-use guard error', async () => {
    jest
      .spyOn(definitionService, 'softDelete')
      .mockRejectedValue(new Error('Cannot delete the connector because it is referenced'));

    await expect(
      facade.deleteConnector({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['editor'],
        connectorId: 'def-1',
      })
    ).rejects.toThrow(/referenced/);
  });
});

describe('listConnectorVersions', () => {
  const definitionService = {
    getById: jest.fn(),
    listVersions: jest.fn(),
  } as unknown as ConnectorDefinitionService;
  const facade = new McpConnectorAuthoringFacadeImpl({} as ConnectorTestService, definitionService);

  it('marks the active version and serialises publishedAt', async () => {
    jest
      .spyOn(definitionService, 'getById')
      .mockResolvedValue({ id: 'def-1', activeVersionId: 'ver-2' } as never);
    jest.spyOn(definitionService, 'listVersions').mockResolvedValue([
      {
        id: 'ver-1',
        version: 1,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
      {
        id: 'ver-2',
        version: 2,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-07-02T10:00:00.000Z'),
      },
      { id: 'ver-3', version: 3, status: 'DRAFT', publishedAt: null },
    ] as never);

    const result = await facade.listConnectorVersions({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connectorId: 'def-1',
    });

    expect(result.versions).toEqual([
      { version: 1, status: 'PUBLISHED', publishedAt: '2026-07-01T10:00:00.000Z', isActive: false },
      { version: 2, status: 'PUBLISHED', publishedAt: '2026-07-02T10:00:00.000Z', isActive: true },
      { version: 3, status: 'DRAFT', publishedAt: null, isActive: false },
    ]);
  });

  it('marks nothing active when the connector has no active version', async () => {
    jest
      .spyOn(definitionService, 'getById')
      .mockResolvedValue({ id: 'def-1', activeVersionId: null } as never);
    jest
      .spyOn(definitionService, 'listVersions')
      .mockResolvedValue([
        { id: 'ver-1', version: 1, status: 'DRAFT', publishedAt: null },
      ] as never);

    const result = await facade.listConnectorVersions({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connectorId: 'def-1',
    });

    expect(result.versions[0].isActive).toBe(false);
  });
});

describe('setConnectorVersion', () => {
  const definitionService = {
    setActiveVersion: jest.fn(),
  } as unknown as ConnectorDefinitionService;
  const facade = new McpConnectorAuthoringFacadeImpl({} as ConnectorTestService, definitionService);

  it('delegates to setActiveVersion and echoes the version', async () => {
    const spy = jest
      .spyOn(definitionService, 'setActiveVersion')
      .mockResolvedValue({ id: 'def-1' } as never);

    const result = await facade.setConnectorVersion({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connectorId: 'def-1',
      version: 1,
    });

    expect(spy).toHaveBeenCalledWith('project-1', 'def-1', 1);
    expect(result).toEqual({ connectorId: 'def-1', activeVersion: 1 });
  });
});

/**
 * The MCP pipeline in front of this facade enforces OAuth SCOPES only
 * (McpAuthGuard -> mcp:read, McpSdkServerFactory.assertScopes -> each tool's
 * requiredScopes). Scopes say what the client app asked for; they say nothing
 * about who the user is, so a project viewer whose MCP client holds mcp:write
 * would otherwise reach every mutation here. These tests pin the facade to the
 * same gating the REST ConnectorDefinitionController applies: viewer may read
 * versions, everything that mutates (or drives outbound HTTP) needs editor.
 */
describe('McpConnectorAuthoringFacadeImpl role enforcement', () => {
  const viewer = { projectId: 'p1', userId: 'u1', roles: ['viewer'] };

  function buildFacade() {
    const testService = { runTest: jest.fn() } as unknown as ConnectorTestService;
    const definitionService = {
      create: jest.fn(),
      createAndPublish: jest.fn(),
      saveDraft: jest.fn(),
      publish: jest.fn(),
      getById: jest.fn(),
      softDelete: jest.fn(),
      listVersions: jest.fn(),
      setActiveVersion: jest.fn(),
    } as unknown as ConnectorDefinitionService;
    return {
      testService,
      definitionService,
      facade: new McpConnectorAuthoringFacadeImpl(testService, definitionService),
    };
  }

  it('refuses connector_test for a viewer before any outbound request is made', async () => {
    const { testService, facade } = buildFacade();

    const call = facade.testConnector({ ...viewer, manifest: { nodes: {} }, node: 'Repos' });

    await expect(call).rejects.toThrow(ForbiddenException);
    await expect(call).rejects.toThrow(/connector_test/);
    // connector_test drives outbound HTTP from our servers; the refusal must
    // land before the request is issued, not after.
    expect(testService.runTest).not.toHaveBeenCalled();
  });

  it('refuses connector_publish for a viewer without touching the definition', async () => {
    const { definitionService, facade } = buildFacade();

    const call = facade.publishConnector({
      ...viewer,
      name: 'Acme',
      title: 'Acme API',
      manifest: { version: '1.0' },
    });

    await expect(call).rejects.toThrow(ForbiddenException);
    await expect(call).rejects.toThrow(/connector_publish/);
    expect(definitionService.create).not.toHaveBeenCalled();
    expect(definitionService.createAndPublish).not.toHaveBeenCalled();
    expect(definitionService.saveDraft).not.toHaveBeenCalled();
    expect(definitionService.publish).not.toHaveBeenCalled();
  });

  it('refuses connector_delete for a viewer without soft-deleting', async () => {
    const { definitionService, facade } = buildFacade();

    const call = facade.deleteConnector({ ...viewer, connectorId: 'def-1' });

    await expect(call).rejects.toThrow(ForbiddenException);
    await expect(call).rejects.toThrow(/connector_delete/);
    expect(definitionService.softDelete).not.toHaveBeenCalled();
  });

  it('refuses connector_set_version for a viewer without moving the active version', async () => {
    const { definitionService, facade } = buildFacade();

    const call = facade.setConnectorVersion({ ...viewer, connectorId: 'def-1', version: 1 });

    await expect(call).rejects.toThrow(ForbiddenException);
    await expect(call).rejects.toThrow(/connector_set_version/);
    expect(definitionService.setActiveVersion).not.toHaveBeenCalled();
  });

  it('names the required role in the refusal message', async () => {
    const { facade } = buildFacade();

    await expect(facade.deleteConnector({ ...viewer, connectorId: 'def-1' })).rejects.toThrow(
      /editor/
    );
  });

  it('still lets a viewer list connector versions', async () => {
    const { definitionService, facade } = buildFacade();
    jest
      .spyOn(definitionService, 'getById')
      .mockResolvedValue({ id: 'def-1', activeVersionId: 'ver-1' } as never);
    jest
      .spyOn(definitionService, 'listVersions')
      .mockResolvedValue([
        { id: 'ver-1', version: 1, status: 'PUBLISHED', publishedAt: null },
      ] as never);

    const result = await facade.listConnectorVersions({ ...viewer, connectorId: 'def-1' });

    expect(result.versions).toEqual([
      { version: 1, status: 'PUBLISHED', publishedAt: null, isActive: true },
    ]);
  });

  it('allows every mutation for an admin (editor is a floor, not an equality check)', async () => {
    const { testService, definitionService, facade } = buildFacade();
    const adminCtx = { projectId: 'p1', userId: 'u1', roles: ['admin'] };
    jest
      .spyOn(testService, 'runTest')
      .mockResolvedValue({ rows: [], sample: [], error: null, logs: [] } as never);
    jest.spyOn(definitionService, 'softDelete').mockResolvedValue(undefined);
    jest.spyOn(definitionService, 'setActiveVersion').mockResolvedValue({ id: 'def-1' } as never);
    jest.spyOn(definitionService, 'publish').mockResolvedValue({
      version: 1,
      status: 'PUBLISHED',
    } as never);
    jest.spyOn(definitionService, 'createAndPublish').mockResolvedValue({
      definition: { id: 'def-1', name: 'Acme' },
      version: { version: 1, status: 'PUBLISHED' },
    } as never);

    await expect(
      facade.testConnector({ ...adminCtx, manifest: { nodes: {} }, node: 'Repos' })
    ).resolves.toEqual({ rows: [], sample: [], error: null, logs: [] });
    await expect(
      facade.publishConnector({ ...adminCtx, name: 'Acme', title: 'Acme API', manifest: {} })
    ).resolves.toMatchObject({ connectorId: 'def-1' });
    await expect(facade.deleteConnector({ ...adminCtx, connectorId: 'def-1' })).resolves.toEqual({
      connectorId: 'def-1',
      deleted: true,
    });
    await expect(
      facade.setConnectorVersion({ ...adminCtx, connectorId: 'def-1', version: 1 })
    ).resolves.toEqual({ connectorId: 'def-1', activeVersion: 1 });
  });
});
