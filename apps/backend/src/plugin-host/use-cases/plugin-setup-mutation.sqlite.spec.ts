import { InstallPluginCommand } from '../dto/domain/install-plugin.command';
import { AddPluginSetupApproval1792407000000 } from '../../migrations/1792407000000-add-plugin-setup-approval';
import { CredentialOwner } from '../../data-marts/credentials/entities/credential-owner.entity';
import { CredentialContext } from '../../data-marts/credentials/entities/credential-context.entity';
import { Context } from '../../data-marts/entities/context.entity';
jest.mock('../../data-marts/services/access-decision/access-decision.service', () => ({
  AccessDecisionService: jest.fn(),
}));
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntitySchema } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { Plugin } from '../entities/plugin.entity';
import { PluginVersion } from '../entities/plugin-version.entity';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import { PluginSetupApproval } from '../entities/plugin-setup-approval.entity';
import { PluginAuditEvent } from '../entities/plugin-audit-event.entity';
import { MutationReceipt } from '../../common/mutations/mutation-receipt.entity';
import { MutationReceiptService } from '../../common/mutations/mutation-receipt.service';
import { Credential } from '../../data-marts/credentials/entities/credential.entity';
import { CredentialConsumerBinding } from '../../data-marts/credentials/entities/credential-consumer-binding.entity';
import { CredentialConsumerBindingFacadeImpl } from '../../data-marts/credentials/facades/credential-consumer-binding.facade.impl';
import { CredentialService } from '../../data-marts/credentials/services/credential.service';
import { PluginService } from '../services/plugin.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginAuditService } from '../services/plugin-audit.service';
import { InstallPluginService } from './install-plugin.service';
import { UninstallPluginService } from './uninstall-plugin.service';
import { PluginSetupMutationService } from './plugin-setup-mutation.service';
import type { PluginSetupMutationRequest } from '../dto/domain/mcp-plugin-mutation.dto';

const pluginSchema = new EntitySchema({
  name: 'PluginFixture',
  target: Plugin,
  columns: {
    id: { type: String, primary: true },
    currentVersionId: { type: String },
    suspendedAt: { type: Date, nullable: true },
    modifiedAt: { type: Date, updateDate: true },
  },
});
const versionSchema = new EntitySchema({
  name: 'VersionFixture',
  target: PluginVersion,
  columns: {
    id: { type: String, primary: true },
    credentialRequirements: { type: 'simple-json', nullable: true },
  },
});
const request: PluginSetupMutationRequest = {
  projectId: 'project',
  userId: 'member',
  roles: ['editor'],
  pluginId: 'plugin',
  expectedVersionId: 'version',
  operationId: 'install-1',
  expectedRevision: 0,
};

initializeTransactionalContext({ storageDriver: StorageDriver.ASYNC_LOCAL_STORAGE });
describe('Plugin Setup main SQLite transaction', () => {
  let db: DataSource;
  let service: PluginSetupMutationService;
  let receipts: MutationReceiptService;
  let bindings: CredentialConsumerBindingFacadeImpl;
  let canUse: jest.Mock;
  let installService: InstallPluginService;
  let plugins: PluginService;
  beforeEach(async () => {
    db = addTransactionalDataSource(
      new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        synchronize: true,
        entities: [
          pluginSchema,
          versionSchema,
          Credential,
          CredentialOwner,
          CredentialContext,
          Context,
          PluginInstallation,
          PluginSetupApproval,
          PluginAuditEvent,
          MutationReceipt,
          CredentialConsumerBinding,
        ],
      })
    );
    await db.initialize();
    await db
      .getRepository(Plugin)
      .save({ id: 'plugin', currentVersionId: 'version', suspendedAt: null });
    await db.getRepository(PluginVersion).save({
      id: 'version',
      credentialRequirements: [{ id: 'api', definitionId: 'header', optional: false }] as never,
    });
    await db.getRepository(Credential).save({
      id: 'credential',
      projectId: 'project',
      definitionId: 'header',
      definitionSource: 'builtin',
      title: 'Header',
      secret: {},
      enabled: true,
    });
    canUse = jest.fn().mockResolvedValue(true);
    bindings = new CredentialConsumerBindingFacadeImpl(
      db.getRepository(CredentialConsumerBinding),
      db.getRepository(Credential),
      { getForCredential: jest.fn().mockResolvedValue({ contract: {} }) } as never,
      { canAccess: canUse } as never,
      new CredentialService(
        db.getRepository(Credential),
        db.getRepository(CredentialConsumerBinding)
      )
    );
    const installations = new PluginInstallationService(db.getRepository(PluginInstallation));
    plugins = new PluginService(db.getRepository(Plugin));
    const versions = new PluginVersionService(
      db.getRepository(PluginVersion),
      db.getRepository(Plugin),
      db
    );
    const audit = new PluginAuditService(db.getRepository(PluginAuditEvent), {
      publishOnCommit: jest.fn(),
    } as never);
    installService = new InstallPluginService(
      plugins,
      versions,
      installations,
      audit,
      { ensureScheduled: jest.fn().mockResolvedValue(false) } as never,
      {} as never,
      bindings
    );
    receipts = new MutationReceiptService();
    service = new PluginSetupMutationService(
      db,
      receipts,
      installations,
      plugins,
      installService,
      new UninstallPluginService(installations, audit, bindings),
      { getPublicOrigin: () => 'https://app.test' } as never,
      versions,
      bindings
    );
  });
  afterEach(async () => {
    await db.destroy();
    deleteDataSourceByName('default');
  });
  async function prepare(r = request) {
    return (await service.mutate(r, 'install')).approvalId!;
  }
  async function complete(id: string, r = request) {
    await service.complete(
      { projectId: r.projectId, userId: r.userId, roles: r.roles },
      r.pluginId,
      id,
      r.expectedVersionId,
      { api: 'credential' }
    );
  }

  it('requires app completion and atomically commits actual bindings, audit and receipt', async () => {
    const id = await prepare();
    await expect(service.mutate({ ...request, approvalId: id }, 'install')).rejects.toBeInstanceOf(
      ConflictException
    );
    await complete(id);
    expect(await db.getRepository(CredentialConsumerBinding).countBy({ active: true })).toBe(1);
    expect(await db.getRepository(PluginAuditEvent).count()).toBe(1);
    expect(await db.getRepository(MutationReceipt).countBy({ status: 'completed' })).toBe(1);
    await db.getRepository(PluginSetupApproval).update(id, { expiresAt: new Date(0) });
    await complete(id);
    await expect(
      service.complete(
        { projectId: request.projectId, userId: request.userId, roles: request.roles },
        'plugin',
        id,
        'version',
        { api: 'different' }
      )
    ).rejects.toBeInstanceOf(ConflictException);
    const recovered = await service.mutate({ ...request, approvalId: id }, 'install');
    expect(recovered).toMatchObject({ state: 'completed', revision: 1 });
    expect(await service.mutate({ ...request, approvalId: id }, 'install')).toEqual(recovered);
    expect(await db.getRepository(PluginInstallation).count()).toBe(1);
  });
  it('rolls back installation, binding, audit, approval and receipt when receipt completion fails', async () => {
    const id = await prepare();
    jest.spyOn(receipts, 'complete').mockRejectedValueOnce(new Error('forced after effect'));
    await expect(complete(id)).rejects.toThrow('forced after effect');
    expect(await db.getRepository(PluginInstallation).count()).toBe(0);
    expect(await db.getRepository(CredentialConsumerBinding).count()).toBe(0);
    expect(await db.getRepository(PluginAuditEvent).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
    expect((await db.getRepository(PluginSetupApproval).findOneByOrFail({ id })).status).toBe(
      'pending'
    );
    await complete(id);
    expect(await db.getRepository(PluginInstallation).count()).toBe(1);
  });
  it('rolls back uninstall revision, binding deactivation, audit and receipt on a later failure', async () => {
    const id = await prepare();
    await complete(id);
    jest.spyOn(receipts, 'complete').mockRejectedValueOnce(new Error('uninstall commit failure'));
    const remove = { ...request, expectedRevision: 1, operationId: 'remove' };
    await expect(service.uninstall(remove)).rejects.toThrow('uninstall commit failure');
    const current = await db
      .getRepository(PluginInstallation)
      .findOneByOrFail({ pluginId: 'plugin', userId: 'member' });
    expect(current).toMatchObject({ revision: 1, uninstalledAt: null });
    expect(await db.getRepository(CredentialConsumerBinding).countBy({ active: true })).toBe(1);
    expect(await db.getRepository(MutationReceipt).count()).toBe(1);
    expect(await db.getRepository(PluginAuditEvent).count()).toBe(1);
    await expect(service.uninstall(remove)).resolves.toMatchObject({
      state: 'completed',
      revision: 2,
    });
  });

  it('rejects other actors, revoked, expired, changed version and revoked Credential access', async () => {
    const id = await prepare();
    await expect(
      service.complete(
        { projectId: request.projectId, userId: 'other', roles: request.roles },
        'plugin',
        id,
        'version',
        { api: 'credential' }
      )
    ).rejects.toThrow();
    await expect(
      service.complete(
        {
          projectId: request.projectId,
          userId: request.userId,
          roles: request.roles,
          apiKeyId: 'key',
        },
        'plugin',
        id,
        'version',
        { api: 'credential' }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    await db.getRepository(Plugin).update('plugin', { currentVersionId: 'new-version' });
    await expect(complete(id)).rejects.toThrow();
    await db.getRepository(Plugin).update('plugin', { currentVersionId: 'version' });
    canUse.mockResolvedValue(false);
    await expect(complete(id)).rejects.toBeInstanceOf(ForbiddenException);
    canUse.mockResolvedValue(true);
    await service.revoke(
      { projectId: request.projectId, userId: request.userId, roles: request.roles },
      'plugin',
      id
    );
    await expect(complete(id)).rejects.toThrow('revoked');
    const expired = await prepare();
    await db.getRepository(PluginSetupApproval).update(expired, { expiresAt: new Date(0) });
    await expect(complete(expired)).rejects.toThrow('expired');
  });
  it('uninstalls a suspended Plugin, restores with a new generation, and never repeats an old uninstall', async () => {
    const id = await prepare();
    await complete(id);
    await db.getRepository(Plugin).update('plugin', { suspendedAt: new Date() });
    const uninstall = { ...request, operationId: 'uninstall-1', expectedRevision: 1 };
    const removed = await service.uninstall(uninstall);
    expect(removed.revision).toBe(2);
    await db.getRepository(Plugin).update('plugin', { suspendedAt: null });
    const restore = { ...request, operationId: 'restore-1', expectedRevision: 2 };
    const restoreId = await prepare(restore);
    await complete(restoreId, restore);
    expect(await service.uninstall(uninstall)).toEqual(removed);
    const current = await db
      .getRepository(PluginInstallation)
      .findOneByOrFail({ id: removed.installationId! });
    expect(current).toMatchObject({ revision: 3, uninstalledAt: null });
    await expect(
      service.uninstall({ ...uninstall, operationId: 'new-uninstall' })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await db.getRepository(CredentialConsumerBinding).countBy({ active: true })).toBe(1);
  });
  it('reconfigures only an active installation and invalidates old reviews through every app writer', async () => {
    const id = await prepare();
    await complete(id);
    const reconfigure = { ...request, operationId: 'reconfigure-1', expectedRevision: 1 };
    const review = await service.mutate(reconfigure, 'reconfigure');
    await service.complete(
      { projectId: request.projectId, userId: request.userId, roles: request.roles },
      'plugin',
      review.approvalId!,
      'version',
      { api: 'credential' }
    );
    expect(
      await service.mutate({ ...reconfigure, approvalId: review.approvalId! }, 'reconfigure')
    ).toMatchObject({ state: 'completed', revision: 2 });
    expect(await service.reviewStatus(request, 'plugin')).toMatchObject({ status: 'completed' });
    const beforeOrdinaryAppWrite = await service.mutate(
      { ...request, operationId: 'pending-before-rest', expectedRevision: 2 },
      'reconfigure'
    );
    await installService.run(
      new InstallPluginCommand(
        'plugin',
        'version',
        { projectId: request.projectId, userId: request.userId, roles: request.roles },
        { api: 'credential' }
      )
    );
    await expect(
      service.complete(
        { projectId: request.projectId, userId: request.userId, roles: request.roles },
        'plugin',
        beforeOrdinaryAppWrite.approvalId!,
        'version',
        { api: 'credential' }
      )
    ).rejects.toBeInstanceOf(ConflictException);
    await db.getRepository(PluginInstallation).save({
      pluginId: 'plugin',
      projectId: 'project',
      userId: 'other-member',
      installedAt: new Date(),
    });
    await service.uninstall({ ...request, expectedRevision: 3, operationId: 'remove-own' });
    expect(
      await db
        .getRepository(PluginInstallation)
        .countBy({ userId: 'other-member', uninstalledAt: null as never })
    ).toBe(1);
    await expect(
      service.mutate({ ...reconfigure, operationId: 'stale', expectedRevision: 2 }, 'reconfigure')
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a concurrent version change even when the earlier Plugin read was stale', async () => {
    const id = await prepare();
    const stale = await db.getRepository(Plugin).findOneByOrFail({ id: 'plugin' });
    await db.getRepository(Plugin).update('plugin', { currentVersionId: 'new-version' });
    jest.spyOn(plugins, 'findById').mockResolvedValueOnce(stale);
    await expect(complete(id)).rejects.toThrow('Plugin version or suspension changed');
    expect(await db.getRepository(PluginInstallation).count()).toBe(0);
    expect(await db.getRepository(CredentialConsumerBinding).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
  });

  it('rejects recovery after selected Credential authority is revoked', async () => {
    const id = await prepare();
    await complete(id);
    canUse.mockResolvedValue(false);
    await expect(service.mutate({ ...request, approvalId: id }, 'install')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});

describe('Plugin Setup migration', () => {
  it('assigns revision one to existing installations and creates approvals in the main history', async () => {
    const migrationDb = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    }).initialize();
    try {
      await migrationDb.query('CREATE TABLE plugin_installation (id varchar(36) PRIMARY KEY)');
      await migrationDb.query("INSERT INTO plugin_installation (id) VALUES ('existing')");
      const runner = migrationDb.createQueryRunner();
      await new AddPluginSetupApproval1792407000000().up(runner);
      expect(await migrationDb.query('SELECT revision FROM plugin_installation')).toEqual([
        { revision: 1 },
      ]);
      expect(await runner.hasTable('plugin_setup_approval')).toBe(true);
      await runner.release();
    } finally {
      await migrationDb.destroy();
    }
  });
});
