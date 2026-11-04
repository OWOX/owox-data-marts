jest.mock('typeorm-transactional', () => ({ Transactional: () => () => undefined }));
import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { AccessValidationException } from '../../common/exceptions/access-validation.exception';
import { McpStorageManagementFacadeImpl } from './mcp-storage-management.facade.impl';
import { McpStorageMapper } from '../mappers/mcp-storage.mapper';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  ValidationResult,
  ValidationResultCode,
} from '../data-storage-types/interfaces/data-storage-access-validator.interface';

const actor: AuthorizationContext = { projectId: 'project', userId: 'user', roles: ['editor'] };
function fixture() {
  const storage = {
    id: 'storage',
    title: 'Storage',
    type: DataStorageType.GOOGLE_BIGQUERY,
    config: { projectId: 'my-project', location: 'US' },
    ownerUsers: [{ userId: 'user' }],
    contexts: [],
    createdAt: new Date('2026-11-04'),
    modifiedAt: new Date('2026-11-04'),
    availableForUse: true,
    availableForMaintenance: false,
  };
  const list = { run: jest.fn().mockResolvedValue([storage]) };
  const get = { run: jest.fn().mockResolvedValue(storage) };
  const create = { run: jest.fn().mockResolvedValue(storage) };
  const update = { run: jest.fn().mockResolvedValue(storage) };
  const validate = { run: jest.fn().mockResolvedValue(ValidationResult.success()) };
  const resources = {
    run: jest
      .fn()
      .mockResolvedValue({ namespaces: [{ id: 'my-project', secret: 'NEVER_EXPOSE' }] }),
  };
  const remove = { run: jest.fn() };
  const facade = new McpStorageManagementFacadeImpl(
    list as never,
    get as never,
    create as never,
    update as never,
    validate as never,
    resources as never,
    remove as never,
    new McpStorageMapper()
  );
  return { facade, storage, list, get, create, update, validate, resources, remove };
}

describe('McpStorageManagementFacadeImpl', () => {
  it('lists only summary fields and leaves protected details to the shared Get use case', async () => {
    const f = fixture();
    expect(await f.facade.list(actor, {})).toEqual([
      {
        id: 'storage',
        title: 'Storage',
        type: DataStorageType.GOOGLE_BIGQUERY,
        createdAt: f.storage.createdAt.toISOString(),
        modifiedAt: f.storage.modifiedAt.toISOString(),
      },
    ]);
    expect(f.get.run).not.toHaveBeenCalled();
  });

  it('filters by type and actual owner', async () => {
    const f = fixture();
    expect(await f.facade.list(actor, { type: DataStorageType.SNOWFLAKE })).toEqual([]);
    expect(await f.facade.list(actor, { ownerId: 'someone-else' })).toEqual([]);
    expect(await f.facade.list(actor, { ownerId: actor.userId })).toHaveLength(1);
  });

  it('uses the shared read permission check', async () => {
    const f = fixture();
    f.get.run.mockRejectedValue(new ForbiddenException());
    await expect(f.facade.get(actor, 'storage')).rejects.toThrow(ForbiddenException);
    expect(f.get.run).toHaveBeenCalledWith(expect.objectContaining({ ...actor, id: 'storage' }));
  });

  it('maps the created Storage without a second read', async () => {
    const f = fixture();
    f.create.run.mockResolvedValue({ ...f.storage, id: 'created', title: 'Finance warehouse' });
    expect(
      await f.facade.create(actor, {
        type: DataStorageType.GOOGLE_BIGQUERY,
        title: 'Finance warehouse',
      })
    ).toMatchObject({ id: 'created', title: 'Finance warehouse' });
    expect(f.create.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: actor.projectId,
        userId: actor.userId,
        type: DataStorageType.GOOGLE_BIGQUERY,
        title: 'Finance warehouse',
      })
    );
    expect(f.get.run).not.toHaveBeenCalled();
  });

  it('uses the common update command and preserves omitted fields', async () => {
    const f = fixture();
    f.update.run.mockResolvedValue({ ...f.storage, title: 'New title' });
    expect(await f.facade.update(actor, 'storage', { title: 'New title' })).toMatchObject({
      id: 'storage',
      title: 'New title',
    });
    expect(f.update.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ...actor,
        id: 'storage',
        title: 'New title',
        config: undefined,
        reusableCredentialId: undefined,
        ownerIds: undefined,
        contextIds: undefined,
        availableForUse: undefined,
      })
    );
    expect(f.get.run).not.toHaveBeenCalled();
  });

  it('maps configuration and a saved Credential to the shared update command', async () => {
    const f = fixture();
    await f.facade.update(actor, 'storage', {
      configuration: f.storage.config,
      credentialId: 'credential',
    });
    expect(f.update.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ...actor,
        id: 'storage',
        config: f.storage.config,
        reusableCredentialId: 'credential',
        title: undefined,
      })
    );
  });

  it('propagates shared update errors without reading details', async () => {
    const f = fixture();
    const error = new AccessValidationException('Invalid configuration');
    f.update.run.mockRejectedValue(error);
    await expect(
      f.facade.update(actor, 'storage', { configuration: f.storage.config })
    ).rejects.toBe(error);
    expect(f.get.run).not.toHaveBeenCalled();
  });

  it('acknowledges access changes without reading details after self-removal', async () => {
    const f = fixture();
    await expect(
      f.facade.setAccess(actor, 'storage', { ownerIds: [], availableForUse: false })
    ).resolves.toBeUndefined();
    expect(f.update.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ...actor,
        id: 'storage',
        ownerIds: [],
        availableForUse: false,
        config: undefined,
        title: undefined,
        contextIds: undefined,
      })
    );
    expect(f.get.run).not.toHaveBeenCalled();
  });

  it.each([
    [ValidationResult.unconfigured('NEVER_EXPOSE'), 'unconfigured'],
    [
      new ValidationResult(
        false,
        'NEVER_EXPOSE',
        undefined,
        ValidationResultCode.INVALID_CONFIGURATION
      ),
      'invalid_configuration',
    ],
    [ValidationResult.oauthReauthRequired('NEVER_EXPOSE'), 'reauthorization_required'],
    [ValidationResult.credentialUnavailable('NEVER_EXPOSE'), 'credential_unavailable'],
    [ValidationResult.failure('NEVER_EXPOSE', { token: 'NEVER_EXPOSE' }), 'validation_failed'],
  ])('maps validation state without provider text: %s', async (result, state) => {
    const f = fixture();
    f.validate.run.mockResolvedValue(result);
    const output = await f.facade.validate(actor, 'storage');
    expect(output.state).toBe(state);
    expect(JSON.stringify(output)).not.toContain('NEVER_EXPOSE');
    expect(f.validate.run).toHaveBeenCalledWith(
      expect.objectContaining({ ...actor, id: 'storage' })
    );
  });

  it('calls shared resource browsing with the actor and removes extra provider fields', async () => {
    const f = fixture();
    expect(await f.facade.listResources(actor, 'storage', { level: 'namespaces' })).toEqual({
      namespaces: [{ id: 'my-project' }],
    });
    expect(f.resources.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectIdContext: actor.projectId,
        userId: actor.userId,
        roles: actor.roles,
        storageId: 'storage',
        level: 'namespaces',
      })
    );
  });

  it('propagates resource browsing errors to the caller', async () => {
    const f = fixture();
    const error = new ForbiddenException('The Credential cannot list resources.');
    f.resources.run.mockRejectedValue(error);
    await expect(f.facade.listResources(actor, 'storage', { level: 'namespaces' })).rejects.toBe(
      error
    );
  });

  it('delegates deletion with the actor and propagates blockers', async () => {
    const f = fixture();
    const error = new BusinessViolationException('Referenced by Data Marts', {
      referencedDataMarts: ['private-mart'],
    });
    f.remove.run.mockRejectedValue(error);
    await expect(f.facade.delete(actor, 'storage')).rejects.toBe(error);
    expect(f.remove.run).toHaveBeenCalledWith(expect.objectContaining({ ...actor, id: 'storage' }));
  });
});
