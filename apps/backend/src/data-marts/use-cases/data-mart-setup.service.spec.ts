jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { ForbiddenException } from '@nestjs/common';
import { DataMartSetupService } from './data-mart-setup.service';
import { McpDataMartSetupMapper } from '../mappers/mcp-data-mart-setup.mapper';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { Action } from '../services/access-decision';
import { McpSetupDiscoveryMapper } from '../mappers/mcp-setup-discovery.mapper';
import { ValidationResult } from '../data-storage-types/interfaces/data-mart-validator.interface';

const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
const request = { ...actor, dataMartId: 'dm' };
function dataMart(): DataMart {
  return Object.assign(new DataMart(), {
    id: 'dm',
    projectId: 'project',
    title: 'Orders',
    status: DataMartStatus.PUBLISHED,
    storage: { id: 'storage', projectId: 'project', type: DataStorageType.GOOGLE_BIGQUERY },
    definitionType: DataMartDefinitionType.SQL,
    definition: { sqlQuery: 'SELECT 1' },
    availableForReporting: true,
    availableForMaintenance: false,
    modifiedAt: new Date('2026-10-19T00:00:00Z'),
    revision: 1,
    contexts: [],
    technicalOwners: [],
    businessOwners: [],
  });
}
describe('DataMartSetupService', () => {
  let dm: DataMart;
  let marts: any;
  let access: any;
  let relationships: any;
  let triggers: any;
  let reports: any;
  let validator: any;
  let service: DataMartSetupService;
  beforeEach(() => {
    dm = dataMart();
    marts = {
      connectorWorkImpact: jest
        .fn()
        .mockResolvedValue({ activeConnectorRunsCount: 0, queuedConnectorWorkCount: 0 }),
      setupDependencyDigest: jest.fn().mockResolvedValue('dependency-digest'),
      getByIdAndProjectId: jest.fn().mockImplementation(async () => dm),
      listSetupMetadata: jest.fn().mockResolvedValue([dm]),
      save: jest.fn(),
    };
    access = { canAccessStored: jest.fn().mockResolvedValue(true), canAccess: jest.fn() };
    relationships = {
      findBySourceDataMartId: jest.fn().mockResolvedValue([]),
      findSourceDataMartIdsByTargetDataMartId: jest.fn().mockResolvedValue([]),
      findGraphEdgesByProjectIdAndSourceDataMartIds: jest.fn().mockResolvedValue([]),
    };
    triggers = { getAllByDataMartIdAndProjectId: jest.fn().mockResolvedValue([]) };
    reports = { countByDataMartIdAndProjectId: jest.fn().mockResolvedValue(2) };
    validator = { validate: jest.fn().mockResolvedValue(ValidationResult.success()) };
    service = new DataMartSetupService(
      marts,
      access,
      relationships,
      triggers,
      reports,
      validator,
      new McpDataMartSetupMapper(),
      { getPublicOrigin: () => 'https://app.owox.com' } as any,
      new McpSetupDiscoveryMapper()
    );
  });
  it('maps published setup without pretending timestamps are revision or schema freshness', async () => {
    const result = await service.get(request);
    expect(result).toMatchObject({
      id: 'dm',
      status: 'PUBLISHED',
      revision: 1,
      definition: { type: 'SQL', sqlQuery: 'SELECT 1' },
      schema: { freshness: 'missing' },
      access: { availableForReporting: true },
      appUrl: 'https://app.owox.com/ui/project/data-marts/dm/data-setup',
    });
    expect(access.canAccess).not.toHaveBeenCalled();
    expect(marts.save).not.toHaveBeenCalled();
  });
  it('omits all connector configuration, runtime state, storage credentials and unknown properties', async () => {
    dm.definitionType = DataMartDefinitionType.CONNECTOR;
    dm.definition = {
      connector: {
        source: {
          name: 'test',
          node: 'node',
          fields: ['id'],
          configuration: [{ token: 'SECRET', _secrets_id: 'SECRET', nested: { value: 'SECRET' } }],
        },
        storage: { fullyQualifiedName: 'p.d.t' },
      },
    };
    (dm.storage as any).config = { password: 'SECRET' };
    (dm as any).connectorState = { token: 'SECRET' };
    const result = await service.get(request);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result.definition).toEqual({
      type: 'CONNECTOR',
      connectorName: 'test',
      node: 'node',
      fields: ['id'],
      version: null,
      fullyQualifiedName: 'p.d.t',
      configurationCount: 1,
      configuration: 'app-managed',
    });
  });
  it.each([
    [DataMartDefinitionType.TABLE, { fullyQualifiedName: 'p.d.t' }],
    [DataMartDefinitionType.VIEW, { fullyQualifiedName: 'p.d.v' }],
    [DataMartDefinitionType.TABLE_PATTERN, { pattern: 'p.d.prefix*' }],
  ])(
    'reads and statically validates %s with the selected provider capability',
    async (type, definition) => {
      dm.definitionType = type;
      dm.definition = definition;
      expect((await service.get(request)).definition).toEqual({ type, ...definition });
      expect(await service.validate({ ...request, mode: 'static' })).toMatchObject({ valid: true });
      dm.storage.type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
      expect(await service.validate({ ...request, mode: 'static' })).toMatchObject({
        valid: false,
        code: 'UNSUPPORTED_DEFINITION_TYPE',
      });
    }
  );
  it('rejects missing actors and viewer roles at direct domain entry points', async () => {
    await expect(service.list({ ...actor, userId: '', limit: 10 })).rejects.toThrow('Setup actor');
    await expect(service.get({ ...request, roles: ['viewer'] })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(marts.getByIdAndProjectId).not.toHaveBeenCalled();
  });
  it('paginates after effective visibility checks without revealing hidden summaries', async () => {
    marts.listSetupMetadata.mockResolvedValue([
      Object.assign(dataMart(), { id: 'hidden', title: 'SECRET' }),
      Object.assign(dataMart(), { id: 'first' }),
      Object.assign(dataMart(), { id: 'second' }),
      Object.assign(dataMart(), { id: 'third' }),
    ]);
    access.canAccessStored.mockImplementation(
      async (_u: string, _r: string[], _e: string, id: string) => id !== 'hidden'
    );
    const result = await service.list({ ...actor, limit: 1, offset: 1 });
    expect(result.items.map(item => item.id)).toEqual(['second']);
    expect(result.hasMore).toBe(true);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('checks project membership before permission and rejects direct unauthorized calls', async () => {
    marts.getByIdAndProjectId.mockRejectedValue(new Error('missing'));
    await expect(service.get(request)).rejects.toThrow('missing');
    expect(access.canAccessStored).not.toHaveBeenCalled();
    marts.getByIdAndProjectId.mockResolvedValue(dm);
    access.canAccessStored.mockResolvedValue(false);
    await expect(service.get(request)).rejects.toBeInstanceOf(ForbiddenException);
    expect(relationships.findBySourceDataMartId).not.toHaveBeenCalled();
  });
  it('lists with read-only Context scope and bounded pagination; failures propagate', async () => {
    await service.list({ ...actor, limit: 10, offset: 2 });
    expect(marts.listSetupMetadata).toHaveBeenCalledWith('project');
    expect(access.canAccess).not.toHaveBeenCalled();
    marts.listSetupMetadata.mockRejectedValue(new Error('database failed'));
    await expect(service.list({ ...actor, limit: 10 })).rejects.toThrow('database failed');
  });
  it('static validation performs no warehouse work and detects a mismatched definition', async () => {
    dm.definition = { pattern: 'p.d.*' };
    expect(await service.validate({ ...request, mode: 'static' })).toMatchObject({
      valid: false,
      code: 'INVALID_DEFINITION',
      currentness: 'current',
      revision: 1,
    });
    expect(validator.validate).not.toHaveBeenCalled();
  });
  it('live validation requires EDIT and storage USE before warehouse work', async () => {
    access.canAccessStored.mockImplementation(
      async (_u: string, _r: string[], _e: string, _id: string, action: Action) =>
        action !== Action.USE
    );
    await expect(service.validate({ ...request, mode: 'live' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(validator.validate).not.toHaveBeenCalled();
  });
  it('sanitizes live validator output and detects concurrent definition changes without saving', async () => {
    validator.validate.mockImplementation(async () => {
      dm = Object.assign(dataMart(), { definition: { sqlQuery: 'SELECT 2' } });
      return ValidationResult.failure('password=SECRET', { token: 'SECRET' });
    });
    const result = await service.validate({ ...request, mode: 'live' });
    expect(result).toMatchObject({
      valid: false,
      code: 'VALIDATION_FAILED',
      currentness: 'changed-during-validation',
    });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(marts.save).not.toHaveBeenCalled();
  });
  it('sanitizes thrown provider errors while propagating a failed currentness read', async () => {
    validator.validate.mockRejectedValue(new Error('token=SECRET'));
    await expect(service.validate({ ...request, mode: 'live' })).rejects.toThrow(
      'Data Mart validation could not be completed'
    );
    validator.validate.mockResolvedValue(ValidationResult.success());
    marts.getByIdAndProjectId
      .mockResolvedValueOnce(dm)
      .mockRejectedValueOnce(new Error('database failed'));
    await expect(service.validate({ ...request, mode: 'live' })).rejects.toThrow('database failed');
  });
  it('delete impact includes all schedule types, Reports, legacy effects, and inbound relationships without leaking hidden IDs', async () => {
    dm.storage.type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    relationships.findSourceDataMartIdsByTargetDataMartId.mockResolvedValue(['hidden']);
    marts.getByIdAndProjectId.mockImplementation(async (id: string) =>
      id === 'hidden' ? Object.assign(dataMart(), { id: 'hidden' }) : dm
    );
    relationships.findGraphEdgesByProjectIdAndSourceDataMartIds.mockResolvedValue([
      { id: 'hidden-edge', sourceDataMartId: 'hidden', targetDataMartId: 'dm', joinConditions: [] },
    ]);
    access.canAccessStored.mockImplementation(
      async (_u: string, _r: string[], _e: string, id: string) => id !== 'hidden'
    );
    triggers.getAllByDataMartIdAndProjectId.mockResolvedValue([
      {
        id: 'load',
        type: 'CONNECTOR_RUN',
        isActive: true,
        cronExpression: '0 * * * *',
        timeZone: 'UTC',
        triggerConfig: { token: 'SECRET' },
      },
      {
        id: 'report',
        type: 'REPORT_RUN',
        isActive: false,
        cronExpression: '0 * * * *',
        timeZone: 'UTC',
      },
    ]);
    const result = await service.impact({ ...request, action: 'delete' });
    expect(result).toMatchObject({
      action: 'delete',
      reportsCount: 2,
      schedules: [{ id: 'load' }, { id: 'report' }],
      restrictedDependencies: true,
      legacyExternalDeletion: true,
      dropsWarehouseTables: false,
      confirmation: 'impact-digest',
    });
    expect(JSON.stringify(result)).not.toContain('hidden');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('does not treat edit permission as deletion authority', async () => {
    access.canAccessStored.mockImplementation(
      async (_u: string, _r: string[], _e: string, _id: string, action: Action) =>
        action !== Action.DELETE
    );
    await expect(service.impact({ ...request, action: 'delete' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(relationships.findBySourceDataMartId).not.toHaveBeenCalled();
    expect(triggers.getAllByDataMartIdAndProjectId).not.toHaveBeenCalled();
  });
  it('rejects definition transitions to/from CONNECTOR and legacy non-SQL impact', async () => {
    await expect(
      service.impact({
        ...request,
        action: 'definition',
        nextDefinitionType: DataMartDefinitionType.CONNECTOR,
      })
    ).rejects.toThrow('connector');
    dm.storage.type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    await expect(
      service.impact({
        ...request,
        action: 'definition',
        nextDefinitionType: DataMartDefinitionType.TABLE,
      })
    ).rejects.toThrow('not supported');
  });
  it('binds an exact proposed definition identically when nextDefinitionType is inferred or explicit', async () => {
    const definition = { type: 'SQL' as const, sqlQuery: 'SELECT 2 AS value' };
    const inferred = await service.impact({ ...request, action: 'definition', definition });
    const explicit = await service.impact({
      ...request,
      action: 'definition',
      definition,
      nextDefinitionType: DataMartDefinitionType.SQL,
    });
    expect(inferred.nextDefinitionType).toBe(DataMartDefinitionType.SQL);
    expect(inferred.impactDigest).toBe(explicit.impactDigest);
    await expect(
      service.impact({
        ...request,
        action: 'definition',
        definition,
        nextDefinitionType: DataMartDefinitionType.TABLE,
      })
    ).rejects.toThrow('does not match');
  });
});
