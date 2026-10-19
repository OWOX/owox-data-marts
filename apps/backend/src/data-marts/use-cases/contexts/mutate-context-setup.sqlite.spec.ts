jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));
jest.mock('../../services/data-mart.service', () => ({ DataMartService: jest.fn() }));
import { DataSource, EntitySchema } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { Context } from '../../entities/context.entity';
import { ContextReferenceGuard } from '../../entities/context-reference-guard.entity';
import { MemberRoleScope } from '../../entities/member-role-scope.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { UserProvisioningContextSettings } from '../../entities/user-provisioning-context-settings.entity';
import { UserProvisioningContextSettingsContext } from '../../entities/user-provisioning-context-settings-context.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { DestinationContext } from '../../entities/destination-context.entity';
import { CredentialContext } from '../../credentials/entities/credential-context.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataDestination } from '../../entities/data-destination.entity';
import { Credential } from '../../credentials/entities/credential.entity';
import { ContextService } from '../../services/context/context.service';
import { ContextAccessService } from '../../services/context/context-access.service';
import { UserProvisioningContextSettingsService } from '../../services/context/user-provisioning-context-settings.service';
import { MutationReceiptService } from '../../../common/mutations/mutation-receipt.service';
import { MutationReceipt } from '../../../common/mutations/mutation-receipt.entity';
import { MutateContextSetupService } from './mutate-context-setup.service';
import { SetContextMembersService } from './set-context-members.service';
import { ContextMapper } from '../../mappers/context.mapper';
import { UserProjectionsListDto } from '../../../idp/dto/domain/user-projections-list.dto';
import { RoleScope } from '../../enums/role-scope.enum';
import type { ContextChange } from '../../dto/domain/context-mutation.dto';
import { OwnerStatus } from '../../services/access-decision/access-decision.types';
import { serializeSqliteTransactions } from '../../../config/sqlite-transaction-serializer';
import { AddContextReferenceGuard1792402000000 } from '../../../migrations/1792402000000-add-context-reference-guard';

const resources = [DataMart, DataStorage, DataDestination, Credential].map(
  target =>
    new EntitySchema({
      name: target.name,
      target,
      columns: {
        id: { type: String, primary: true },
        projectId: { type: String },
        revision: { type: Number, default: 1 },
        deletedAt: { type: Date, nullable: true, deleteDate: true },
      },
    })
);
const bindings = [DataMartContext, StorageContext, DestinationContext, CredentialContext].map(
  (target, index) =>
    new EntitySchema({
      name: target.name,
      target,
      columns: {
        [['dataMartId', 'storageId', 'destinationId', 'credentialId'][index]]: {
          type: String,
          primary: true,
        },
        contextId: { type: String, primary: true },
      },
    })
);
const actor = { projectId: 'p', userId: 'admin', roles: ['admin'] as ('admin' | 'editor')[] };

describe('Context mutations using real SQLite and ambient transactions', () => {
  let db: DataSource;
  let writer: MutateContextSetupService;
  let contexts: ContextService;
  let defaults: UserProvisioningContextSettingsService;
  let assignments: ContextAccessService;
  let receipts: MutationReceiptService;
  let idp: {
    getProjectForUser: jest.Mock;
    getProjectMembersOrThrow: jest.Mock;
    getUserProvisioningSettings: jest.Mock;
  };
  let owner: jest.Mock;
  beforeAll(() => initializeTransactionalContext({ storageDriver: StorageDriver.AUTO }));
  beforeEach(async () => {
    db = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        Context,
        ContextReferenceGuard,
        MemberRoleScope,
        MemberRoleContext,
        UserProvisioningContextSettings,
        UserProvisioningContextSettingsContext,
        MutationReceipt,
        ...resources,
        ...bindings,
      ],
      synchronize: true,
    });
    await db.initialize();
    addTransactionalDataSource(db);
    serializeSqliteTransactions(db);
    const repo = <T extends object>(entity: new () => T) => db.getRepository(entity);
    contexts = new ContextService(
      repo(Context),
      repo(DataMartContext),
      repo(StorageContext),
      repo(DestinationContext),
      repo(MemberRoleContext),
      repo(MemberRoleScope),
      repo(UserProvisioningContextSettingsContext),
      new ContextMapper(),
      {
        fetchUserProjectionsList: jest.fn().mockResolvedValue(new UserProjectionsListDto([])),
      } as never
    );
    defaults = new UserProvisioningContextSettingsService(
      repo(UserProvisioningContextSettings),
      repo(UserProvisioningContextSettingsContext),
      repo(MemberRoleScope),
      repo(MemberRoleContext),
      contexts
    );
    owner = jest.fn().mockResolvedValue(OwnerStatus.OWNER);
    assignments = new ContextAccessService(
      repo(DataMartContext),
      repo(StorageContext),
      repo(DestinationContext),
      repo(MemberRoleScope),
      repo(MemberRoleContext),
      contexts,
      defaults,
      { getOwnerStatus: owner } as never,
      repo(CredentialContext),
      {
        advanceConfigurationRevision: async (manager, id, projectId) => {
          await manager.getRepository(DataMart).increment({ id, projectId }, 'revision', 1);
          return 2;
        },
      } as never
    );
    idp = {
      getProjectForUser: jest
        .fn()
        .mockResolvedValue({ id: 'p', status: 'active', roles: ['admin'] }),
      getProjectMembersOrThrow: jest.fn().mockResolvedValue([
        { userId: 'admin', role: 'admin' },
        { userId: 'member', role: 'editor' },
      ]),
      getUserProvisioningSettings: jest.fn().mockResolvedValue({
        isApplicable: true,
        organization: { mainProjectName: 'p' },
        settings: { defaultRole: 'editor', mode: 'all' },
      }),
    };
    receipts = new MutationReceiptService();
    writer = new MutateContextSetupService(
      db,
      idp as never,
      contexts,
      assignments,
      defaults,
      receipts
    );
  });
  afterEach(async () => {
    deleteDataSourceByName('default');
    await db.destroy();
  });
  const create = () =>
    writer.run(actor, { action: 'create_context', name: 'Marketing', operationId: 'create' });
  async function mutate(change: ContextChange, operationId?: string) {
    const impact = await writer.impact(actor, change);
    return writer.run(actor, {
      ...change,
      expectedRevision: impact.revision,
      impactDigest: impact.impactDigest,
      ...(operationId ? { operationId } : {}),
    });
  }

  it('runs the actual guard migration and initializes existing project snapshots at one', async () => {
    await db.getRepository(Context).save({ name: 'Existing', projectId: 'existing' });
    await db
      .getRepository(MemberRoleScope)
      .save({ projectId: 'members-only', userId: 'member', roleScope: RoleScope.ENTIRE_PROJECT });
    await db.query('DROP TABLE context_reference_guard');
    const runner = db.createQueryRunner();
    await new AddContextReferenceGuard1792402000000().up(runner);
    expect(
      await db.getRepository(ContextReferenceGuard).find({ order: { projectId: 'ASC' } })
    ).toEqual([
      { projectId: 'existing', revision: 1 },
      { projectId: 'members-only', revision: 1 },
    ]);
    await runner.release();
  });
  it('creates once, recovers the same result, and rejects changed retry intent', async () => {
    const first = await create();
    expect(first.revision).toBe(1);
    expect(await create()).toEqual(first);
    expect(await db.getRepository(Context).count()).toBe(1);
    await expect(
      writer.run(actor, { action: 'create_context', name: 'Changed', operationId: 'create' })
    ).rejects.toThrow('intent');
  });
  it('rolls back the real context and guard with the receipt if completion fails', async () => {
    jest.spyOn(receipts, 'complete').mockRejectedValueOnce(new Error('forced after effect'));
    await expect(create()).rejects.toThrow('forced after effect');
    expect(await db.getRepository(Context).count()).toBe(0);
    expect(await db.getRepository(ContextReferenceGuard).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
    expect((await create()).revision).toBe(1);
  });
  it('serializes concurrent live names and permits name reuse after explicit delete', async () => {
    const results = await Promise.allSettled([
      create(),
      writer.run(actor, { action: 'create_context', name: 'Marketing', operationId: 'other' }),
    ]);
    expect(results.map(row => (row.status === 'fulfilled' ? 'ok' : String(row.reason)))).toEqual(
      expect.arrayContaining(['ok'])
    );
    const context = (await db.getRepository(Context).find())[0];
    await mutate({ action: 'delete_context', contextId: context.id }, 'delete');
    expect(
      await writer.run(actor, { action: 'create_context', name: 'Marketing', operationId: 'new' })
    ).toMatchObject({ state: 'completed' });
    expect(await create()).toMatchObject({ resourceId: context.id });
  });
  it('rejects stale CAS after REST metadata write, preserving newer data and receipt state', async () => {
    const created = await create();
    const change = {
      action: 'update_context' as const,
      contextId: created.resourceId,
      description: 'MCP',
    };
    const impact = await writer.impact(actor, change);
    await contexts.update(created.resourceId, 'p', 'Marketing', 'REST');
    await expect(
      writer.run(actor, {
        ...change,
        expectedRevision: impact.revision,
        impactDigest: impact.impactDigest,
      })
    ).rejects.toThrow('changed');
    expect(
      (await db.getRepository(Context).findOneByOrFail({ id: created.resourceId })).description
    ).toBe('REST');
  });
  it('clears a stored Context description when null is explicitly supplied', async () => {
    const created = await writer.run(actor, {
      action: 'create_context',
      name: 'Described',
      description: 'Old description',
      operationId: 'described',
    });
    await mutate({ action: 'update_context', contextId: created.resourceId, description: null });
    expect(
      (await db.getRepository(Context).findOneByOrFail({ id: created.resourceId })).description
    ).toBeNull();
  });
  it('patches metadata, rejects duplicate update names, and requires exact reviewed input', async () => {
    const created = await create();
    await writer.run(actor, { action: 'create_context', name: 'Sales', operationId: 'sales' });
    await expect(
      mutate({ action: 'update_context', contextId: created.resourceId, name: 'Sales' })
    ).rejects.toThrow('already exists');
    await mutate({ action: 'update_context', contextId: created.resourceId, description: 'new' });
    expect((await db.getRepository(Context).findOneByOrFail({ id: created.resourceId })).name).toBe(
      'Marketing'
    );
    const impact = await writer.impact(actor, {
      action: 'update_context',
      contextId: created.resourceId,
      name: 'Reviewed',
    });
    await expect(
      writer.run(actor, {
        action: 'update_context',
        contextId: created.resourceId,
        name: 'Different',
        expectedRevision: impact.revision,
        impactDigest: impact.impactDigest,
      })
    ).rejects.toThrow('impact');
  });
  it.each(['DATA_MART', 'STORAGE', 'DESTINATION', 'CREDENTIAL'] as const)(
    'sets %s attachments with project checks and blocks delete until detach',
    async entityType => {
      const created = await create();
      const index = ['DATA_MART', 'STORAGE', 'DESTINATION', 'CREDENTIAL'].indexOf(entityType);
      await db.getRepository(resources[index]).save({ id: 'resource', projectId: 'p' });
      await mutate({
        action: 'set_entity_contexts',
        entityType,
        entityId: 'resource',
        contextIds: [created.resourceId],
      });
      await expect(
        mutate({ action: 'delete_context', contextId: created.resourceId }, 'blocked')
      ).rejects.toThrow('Detach');
      await mutate({
        action: 'set_entity_contexts',
        entityType,
        entityId: 'resource',
        contextIds: [],
      });
      const deleted = await mutate(
        { action: 'delete_context', contextId: created.resourceId },
        'delete'
      );
      expect(deleted.deleted).toBe(true);
      expect(await db.getRepository(MutationReceipt).countBy({ status: 'completed' })).toBe(2);
    }
  );
  it('keeps role scope unchanged in membership replacement, allows selected-empty and normalizes admin', async () => {
    const created = await create();
    await db
      .getRepository(MemberRoleScope)
      .save({ userId: 'member', projectId: 'p', roleScope: RoleScope.SELECTED_CONTEXTS });
    await mutate({
      action: 'set_context_members',
      contextId: created.resourceId,
      assignedUserIds: ['admin', 'member'],
    });
    expect(await db.getRepository(MemberRoleContext).find()).toHaveLength(1);
    await mutate({
      action: 'set_context_members',
      contextId: created.resourceId,
      assignedUserIds: [],
    });
    expect(
      (
        await db
          .getRepository(MemberRoleScope)
          .findOneByOrFail({ userId: 'member', projectId: 'p' })
      ).roleScope
    ).toBe(RoleScope.SELECTED_CONTEXTS);
    await mutate({
      action: 'set_member_context_scope',
      memberId: 'member',
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: [],
    });
    await mutate({
      action: 'set_member_context_scope',
      memberId: 'admin',
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: [created.resourceId],
    });
    expect(
      (await db.getRepository(MemberRoleScope).findOneByOrFail({ userId: 'admin', projectId: 'p' }))
        .roleScope
    ).toBe(RoleScope.ENTIRE_PROJECT);
  });
  it.each(['MCP', 'REST'])(
    '%s replaces implicit default membership and keeps selected-empty scope after lazy access',
    async surface => {
      const created = await create();
      await db
        .getRepository(UserProvisioningContextSettings)
        .save({ projectId: 'p', roleScope: RoleScope.SELECTED_CONTEXTS });
      await db
        .getRepository(UserProvisioningContextSettingsContext)
        .save({ projectId: 'p', contextId: created.resourceId });
      const change = {
        action: 'set_context_members' as const,
        contextId: created.resourceId,
        assignedUserIds: [],
      };
      const impact = await writer.impact(actor, change);
      expect(impact.effects.currentMemberIds).toEqual(['member']);
      expect(impact.effects.affectedMemberIds).toEqual(['member']);
      if (surface === 'MCP') await mutate(change);
      else
        await new SetContextMembersService(idp as never, assignments).run(
          created.resourceId,
          'p',
          [],
          impact.revision
        );
      expect(await assignments.getReadOnlyMemberScope('member', 'p')).toEqual({
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: [],
      });
      await defaults.applyDefaultScopeToMember('member', 'p');
      expect(await assignments.getMemberContextIds('member', 'p')).toEqual([]);
      expect(await db.getRepository(MemberRoleScope).findOneBy({ userId: 'admin' })).toBeNull();
    }
  );
  it('adds a Context to an implicit selected scope without losing its other default Context', async () => {
    const first = await create();
    const second = await writer.run(actor, {
      action: 'create_context',
      name: 'Sales',
      operationId: 'second',
    });
    await db
      .getRepository(UserProvisioningContextSettings)
      .save({ projectId: 'p', roleScope: RoleScope.SELECTED_CONTEXTS });
    await db
      .getRepository(UserProvisioningContextSettingsContext)
      .save({ projectId: 'p', contextId: first.resourceId });
    await mutate({
      action: 'set_context_members',
      contextId: second.resourceId,
      assignedUserIds: ['member', 'admin'],
    });
    expect((await assignments.getReadOnlyMemberScope('member', 'p')).contextIds.sort()).toEqual(
      [first.resourceId, second.resourceId].sort()
    );
    await defaults.applyDefaultScopeToMember('member', 'p');
    expect((await assignments.getMemberContextIds('member', 'p')).sort()).toEqual(
      [first.resourceId, second.resourceId].sort()
    );
    expect(await db.getRepository(MemberRoleContext).countBy({ userId: 'admin' })).toBe(0);
  });
  it('preserves old implicit member scopes when defaults change, and rejects selected-empty defaults', async () => {
    const created = await create();
    await db
      .getRepository(UserProvisioningContextSettings)
      .save({ projectId: 'p', roleScope: RoleScope.SELECTED_CONTEXTS });
    await db
      .getRepository(UserProvisioningContextSettingsContext)
      .save({ projectId: 'p', contextId: created.resourceId });
    await mutate({
      action: 'set_context_defaults',
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    });
    expect(await db.getRepository(MemberRoleContext).findBy({ userId: 'member' })).toEqual([
      expect.objectContaining({ contextId: created.resourceId }),
    ]);
    await expect(
      mutate({
        action: 'set_context_defaults',
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: [],
      })
    ).rejects.toThrow('At least one');
    await assignments.updateMember('member', 'p', {
      role: 'editor' as never,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: [],
    });
    await defaults.applyDefaultScopeToMember('member', 'p');
    expect(await db.getRepository(MemberRoleContext).countBy({ userId: 'member' })).toBe(0);
  });
  it('checks current authority on mutation and completed receipt recovery', async () => {
    await create();
    idp.getProjectForUser.mockResolvedValue({ id: 'p', roles: ['viewer'] });
    await expect(create()).rejects.toThrow('authority');
    expect(await db.getRepository(Context).count()).toBe(1);
  });
  it('shows exact assignment changes and rejects non-owner impact inspection and mutation', async () => {
    const created = await create();
    await db.getRepository(resources[1]).save({ id: 'storage', projectId: 'p' });
    await db
      .getRepository(MemberRoleScope)
      .save({ userId: 'member', projectId: 'p', roleScope: RoleScope.SELECTED_CONTEXTS });
    await db
      .getRepository(MemberRoleContext)
      .save({ userId: 'member', projectId: 'p', contextId: created.resourceId });
    const change = {
      action: 'set_entity_contexts' as const,
      entityType: 'STORAGE' as const,
      entityId: 'storage',
      contextIds: [created.resourceId],
    };
    const impact = await writer.impact(actor, change);
    expect(impact.effects).toMatchObject({
      currentContextIds: [],
      proposedContextIds: [created.resourceId],
      affectedMemberIds: ['member'],
    });
    idp.getProjectForUser.mockResolvedValue({ id: 'p', roles: ['editor'] });
    owner.mockResolvedValue(OwnerStatus.NON_OWNER);
    await expect(writer.impact(actor, change)).rejects.toThrow('ownership');
    await expect(
      writer.run(actor, {
        ...change,
        expectedRevision: impact.revision,
        impactDigest: impact.impactDigest,
      })
    ).rejects.toThrow('ownership');
    expect(await db.getRepository(StorageContext).count()).toBe(0);
  });
  it('serializes an assignment against Context deletion without leaving an orphan', async () => {
    const created = await create();
    await db.getRepository(resources[1]).save({ id: 'storage', projectId: 'p' });
    const attach = {
      action: 'set_entity_contexts' as const,
      entityType: 'STORAGE' as const,
      entityId: 'storage',
      contextIds: [created.resourceId],
    };
    const remove = { action: 'delete_context' as const, contextId: created.resourceId };
    const attachImpact = await writer.impact(actor, attach);
    const removeImpact = await writer.impact(actor, remove);
    const results = await Promise.allSettled([
      writer.run(actor, {
        ...attach,
        expectedRevision: attachImpact.revision,
        impactDigest: attachImpact.impactDigest,
      }),
      writer.run(actor, {
        ...remove,
        expectedRevision: removeImpact.revision,
        impactDigest: removeImpact.impactDigest,
        operationId: 'delete-race',
      }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const live = await db.getRepository(Context).findOneBy({ id: created.resourceId });
    const referenceCount = await db.getRepository(StorageContext).count();
    expect(live !== null || referenceCount === 0).toBe(true);
  });
  it('returns the committed deletion tombstone with the original revision precondition', async () => {
    const created = await create();
    const change = { action: 'delete_context' as const, contextId: created.resourceId };
    const impact = await writer.impact(actor, change);
    const command = {
      ...change,
      expectedRevision: impact.revision,
      impactDigest: impact.impactDigest,
      operationId: 'delete-retry',
    };
    const first = await writer.run(actor, command);
    await writer.run(actor, { action: 'create_context', name: 'Another', operationId: 'new' });
    expect(await writer.run(actor, command)).toEqual(first);
    expect(await db.getRepository(Context).count()).toBe(1);
  });
  it('invalidates reviewed membership impact when current IdP roles change', async () => {
    const created = await create();
    const change = {
      action: 'set_context_members' as const,
      contextId: created.resourceId,
      assignedUserIds: ['member'],
    };
    const impact = await writer.impact(actor, change);
    idp.getProjectMembersOrThrow.mockResolvedValue([{ userId: 'member', role: 'admin' }]);
    await expect(
      writer.run(actor, {
        ...change,
        expectedRevision: impact.revision,
        impactDigest: impact.impactDigest,
      })
    ).rejects.toThrow('dependencies');
    expect(await db.getRepository(MemberRoleContext).count()).toBe(0);
  });
  it('rejects a foreign project attachment without changing assignments or revision', async () => {
    const created = await create();
    await db.getRepository(resources[1]).save({ id: 'foreign', projectId: 'other' });
    await expect(
      writer.impact(actor, {
        action: 'set_entity_contexts',
        entityType: 'STORAGE',
        entityId: 'foreign',
        contextIds: [created.resourceId],
      })
    ).rejects.toThrow('this project');
    expect(
      (await db.getRepository(ContextReferenceGuard).findOneByOrFail({ projectId: 'p' })).revision
    ).toBe(created.revision);
  });
  it('rolls replaced attachments and revision back when inserting the new snapshot fails', async () => {
    const first = await create();
    const second = await writer.run(actor, {
      action: 'create_context',
      name: 'Sales',
      operationId: 'sales',
    });
    await db.getRepository(resources[1]).save({ id: 'storage', projectId: 'p' });
    await mutate({
      action: 'set_entity_contexts',
      entityType: 'STORAGE',
      entityId: 'storage',
      contextIds: [first.resourceId],
    });
    const change = {
      action: 'set_entity_contexts' as const,
      entityType: 'STORAGE' as const,
      entityId: 'storage',
      contextIds: [second.resourceId],
    };
    const impact = await writer.impact(actor, change);
    const injected = (
      assignments as unknown as {
        storageContextRepository: ReturnType<typeof db.getRepository<StorageContext>>;
      }
    ).storageContextRepository;
    jest.spyOn(injected, 'save').mockRejectedValueOnce(new Error('assignment insert failed'));
    await expect(
      writer.run(actor, {
        ...change,
        expectedRevision: impact.revision,
        impactDigest: impact.impactDigest,
      })
    ).rejects.toThrow('assignment insert failed');
    expect(await db.getRepository(StorageContext).find()).toEqual([
      { storageId: 'storage', contextId: first.resourceId },
    ]);
    expect(
      (await db.getRepository(ContextReferenceGuard).findOneByOrFail({ projectId: 'p' })).revision
    ).toBe(impact.revision);
  });
});
