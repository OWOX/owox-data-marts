jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));
import { ConnectorAppActionRequiredException } from '../use-cases/connector-authoring.service';
jest.mock('snowflake-sdk', () => ({}));
import {
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { McpCustomConnectorsFacadeImpl } from './mcp-custom-connectors.facade.impl';
import { McpCustomConnectorsMapper } from '../mappers/mcp-custom-connectors.mapper';
import { ConnectorManifestStaticValidationService } from '../services/connector/connector-manifest-static-validation.service';
import { Action, EntityType } from '../services/access-decision';

const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
const manifest = () => ({
  version: '1.0',
  name: 'Custom',
  baseUrl: 'https://api.example.com',
  parameters: {},
  nodes: {
    items: {
      fields: { id: { type: 'string' } },
      uniqueKeys: ['id'],
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: [] },
    },
  },
});
describe('McpCustomConnectorsFacadeImpl', () => {
  const definitions = {
    listByProject: jest.fn(),
    lockReferences: jest.fn(),
    getById: jest.fn(),
    listVersions: jest.fn(),
    getVersion: jest.fn(),
    getActiveVersionNumbersByDefId: jest.fn(),
    getActiveVersionNumberForDef: jest.fn(),
  };
  const marts = { findByProjectIdAndDefinitionType: jest.fn() };
  const access = { canAccessStored: jest.fn() };
  const mapper = new McpCustomConnectorsMapper({
    getPublicOrigin: () => 'https://app.example',
  } as never);
  const authoring = {
    saveDraft: jest.fn(),
    test: jest.fn(),
    editing: jest.fn(),
    currentTestApproval: jest.fn(),
    impact: jest.fn(),
  };
  const facade = new McpCustomConnectorsFacadeImpl(
    definitions as never,
    marts as never,
    access as never,
    mapper,
    new ConnectorManifestStaticValidationService(),
    authoring as never
  );
  const definition = {
    id: 'connector',
    revision: 1,
    projectId: 'project',
    name: 'Custom',
    title: 'Custom title',
    activeVersionId: 'v1',
    logo: 'private payload',
    createdById: 'creator',
  };
  beforeEach(() => {
    jest.resetAllMocks();
    authoring.editing.mockResolvedValue({
      state: 'preparation_required',
      revision: 1,
      editableDraft: null,
    });
    authoring.currentTestApproval.mockResolvedValue(null);
    authoring.impact.mockResolvedValue({ impactDigest: 'digest' });
    definitions.getById.mockResolvedValue(definition);
    definitions.listByProject.mockResolvedValue([definition]);
    definitions.listVersions.mockResolvedValue([
      { id: 'v1', version: 1, status: 'published', publishedAt: new Date('2026-10-01') },
      { id: 'v2', version: 2, status: 'draft', manifest: { private: 'arbitrary secret' } },
    ]);
    definitions.getActiveVersionNumbersByDefId.mockResolvedValue(new Map([['connector', 1]]));
    definitions.getActiveVersionNumberForDef.mockResolvedValue(1);
    definitions.getVersion.mockResolvedValue({ version: 2, status: 'draft', manifest: manifest() });
    marts.findByProjectIdAndDefinitionType.mockResolvedValue([]);
    access.canAccessStored.mockResolvedValue(true);
  });
  it('lists metadata without loading or returning raw manifests', async () => {
    const result = await facade.listConnectors({ ...actor, limit: 1, offset: 0 });
    expect(result.items[0]).toEqual({
      id: 'connector',
      revision: 1,
      name: 'Custom',
      title: 'Custom title',
      description: null,
      docUrl: null,
      activeVersion: 1,
      appUrl: 'https://app.example/ui/project/connectors/builder/connector',
    });
    expect(JSON.stringify(result)).not.toMatch(/private payload|creator|manifest/);
    expect(definitions.getVersion).not.toHaveBeenCalled();
  });
  it('reports versions, read-only impact, pinned consumers and hidden dependencies safely', async () => {
    const mart = (id: string, version?: number, name = 'custom') => ({
      id,
      title: id,
      projectId: 'project',
      definition: {
        connector: { source: { name, version, configuration: [{ Secret: 'never expose' }] } },
      },
    });
    marts.findByProjectIdAndDefinitionType.mockResolvedValue([
      mart('editable'),
      mart('pinned', 1),
      mart('hidden'),
      mart('unrelated', undefined, 'Other'),
    ]);
    access.canAccessStored.mockImplementation(
      async (_u, _r, _type, id, _action) => id !== 'hidden'
    );
    const result = await facade.getConnector({
      ...actor,
      connectorId: 'connector',
      versionsLimit: 100,
      versionsOffset: 0,
    });
    expect(result.impact).toEqual({
      activationVersion: 1,
      activationDigest: null,
      deletionDigest: 'digest',
      referencedConsumers: 3,
      unpinnedConsumers: 2,
      pinnedConsumers: 1,
      hiddenConsumers: 1,
      hasEditAccessToAllUnpinnedConsumers: false,
      deletionBlockedByReferences: true,
      visibleConsumers: [
        {
          id: 'editable',
          title: 'editable',
          pinnedVersion: null,
          affectedByActivation: true,
          canEdit: true,
        },
        {
          id: 'pinned',
          title: 'pinned',
          pinnedVersion: 1,
          affectedByActivation: false,
          canEdit: null,
        },
      ],
      visibleConsumersTruncated: false,
    });
    expect(result.versions).toEqual([
      { version: 1, status: 'published', publishedAt: '2026-10-01T00:00:00.000Z', active: true },
      { version: 2, status: 'draft', publishedAt: null, active: false },
    ]);
    expect(result.editing).toEqual({
      state: 'preparation_required',
      revision: 1,
      editableDraft: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/arbitrary secret|never expose|"id":"hidden"/);
    expect(definitions.getVersion).not.toHaveBeenCalled();
    expect(access.canAccessStored).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DATA_MART,
      'hidden',
      Action.SEE,
      'project'
    );
    expect(access.canAccessStored).not.toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DATA_MART,
      'pinned',
      Action.EDIT,
      'project'
    );
  });
  it('does not turn persisted-read failures into empty metadata', async () => {
    const error = new Error('database failed');
    definitions.listByProject.mockRejectedValue(error);
    await expect(facade.listConnectors({ ...actor, limit: 10, offset: 0 })).rejects.toBe(error);
  });
  it('rejects a foreign project before impact or validation', async () => {
    definitions.getById.mockResolvedValue({ ...definition, projectId: 'foreign' });
    await expect(
      facade.getConnector({
        ...actor,
        connectorId: 'connector',
        versionsLimit: 10,
        versionsOffset: 0,
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(marts.findByProjectIdAndDefinitionType).not.toHaveBeenCalled();
    await expect(
      facade.validateConnector({ ...actor, connectorId: 'connector', version: 2 })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(definitions.getVersion).not.toHaveBeenCalled();
  });
  it('requires editor authority even on direct facade calls', async () => {
    await expect(
      facade.listConnectors({ ...actor, roles: ['viewer'], limit: 10, offset: 0 })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(definitions.listByProject).not.toHaveBeenCalled();
  });
  it('validates saved versions without a write or external request', async () => {
    const result = await facade.validateConnector({
      ...actor,
      connectorId: 'connector',
      version: 2,
    });
    expect(result).toEqual({
      connectorId: 'connector',
      revision: 1,
      version: 2,
      status: 'draft',
      valid: true,
      assessment: 'static_known_positions_only',
      issues: [],
    });
    expect(definitions.getVersion).toHaveBeenCalledWith('project', 'connector', 2);
  });
  it('reports actual format and unavailable safe authoring prerequisites', async () => {
    const result = await facade.getAuthoringSchema(actor);
    expect(result.maxManifestBytes).toBe(120 * 1024);
    expect(result.sourceName.mutable).toBe(false);
    expect(result.safeEditingAvailable).toBe(true);
    expect(result.requiredManifestKeys).toEqual([
      'version',
      'name',
      'baseUrl',
      'parameters',
      'nodes',
    ]);
  });
  it('turns missing app evidence into an actionable app result and sanitizes unexpected errors', async () => {
    authoring.saveDraft.mockRejectedValue(new ConnectorAppActionRequiredException('authoring'));
    const request = {
      ...actor,
      connectorId: 'connector',
      expectedRevision: 1,
      preparationId: 'preparation',
      manifest: {},
    };
    const result = await facade.saveDraft(request);
    expect(result).toMatchObject({
      outcome: 'app_action_required',
      appAction: {
        projectId: actor.projectId,
        connectorId: 'connector',
        reason: 'manifest_preparation_required',
        operation: 'save_custom_connector_draft',
        appUrl: 'https://app.example/ui/project/connectors/builder/connector',
      },
    });
    authoring.saveDraft.mockRejectedValue(new Error('query contained private-secret-value'));
    await expect(facade.saveDraft(request)).rejects.toEqual(
      new InternalServerErrorException('Connector operation could not be completed')
    );
  });
});
