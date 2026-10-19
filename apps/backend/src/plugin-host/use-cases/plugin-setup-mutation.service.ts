import {
  CREDENTIAL_CONSUMER_BINDING_FACADE,
  type CredentialConsumerBindingFacade,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';
import { PluginVersionService } from '../services/plugin-version.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { runInTransaction } from 'typeorm-transactional';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { MutationReceiptService } from '../../common/mutations/mutation-receipt.service';
import type { AuthorizationContext } from '../../idp';
import { InstallPluginCommand } from '../dto/domain/install-plugin.command';
import type {
  PluginSetupMutationDto,
  PluginSetupMutationRequest,
  PluginUninstallRequest,
} from '../dto/domain/mcp-plugin-mutation.dto';
import { UninstallPluginCommand } from '../dto/domain/uninstall-plugin.command';
import { PluginSetupApproval } from '../entities/plugin-setup-approval.entity';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { InstallPluginService } from './install-plugin.service';
import { UninstallPluginService } from './uninstall-plugin.service';
import { PluginService } from '../services/plugin.service';

@Injectable()
export class PluginSetupMutationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly receipts: MutationReceiptService,
    private readonly installations: PluginInstallationService,
    private readonly plugins: PluginService,
    private readonly install: InstallPluginService,
    private readonly uninstallService: UninstallPluginService,
    private readonly origin: PublicOriginService,
    private readonly versions: PluginVersionService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly bindings: CredentialConsumerBindingFacade
  ) {}

  async reviewStatus(
    actor: { projectId: string; userId: string; roles: readonly string[] },
    pluginId: string
  ) {
    this.actor(actor);
    const installation = await this.installations.findOne(pluginId, actor.projectId, actor.userId);
    const plugin = await this.plugins.findById(pluginId);
    const approval =
      plugin?.currentVersionId && installation && !installation.uninstalledAt
        ? await this.dataSource.getRepository(PluginSetupApproval).findOne({
            where: {
              projectId: actor.projectId,
              userId: actor.userId,
              pluginId,
              versionId: plugin.currentVersionId,
              completedRevision: installation.revision,
              status: 'completed',
            },
            order: { createdAt: 'DESC' },
          })
        : null;
    return {
      status: approval ? ('completed' as const) : ('required_in_app' as const),
      appUrl: new URL(
        `/ui/${encodeURIComponent(actor.projectId)}/plugins/${encodeURIComponent(pluginId)}`,
        this.origin.getPublicOrigin()
      ).toString(),
    };
  }

  async mutate(
    request: PluginSetupMutationRequest,
    purpose: 'install' | 'reconfigure'
  ): Promise<PluginSetupMutationDto> {
    this.actor(request);
    this.revision(request.expectedRevision);
    if (!request.operationId?.trim() || request.operationId.length > 255)
      throw new BadRequestException('operationId must be bounded and nonempty');
    return runInTransaction(async () => {
      const manager = this.manager();
      const plugin = await this.plugins.findById(request.pluginId);
      if (!plugin) throw new NotFoundException('Plugin was not found');
      if (!request.approvalId) {
        if (plugin.suspendedAt || plugin.currentVersionId !== request.expectedVersionId) {
          throw new ConflictException('Review the current available Plugin version in the app');
        }
        const current = await this.installations.findOne(
          request.pluginId,
          request.projectId,
          request.userId
        );
        if ((current?.revision ?? 0) !== request.expectedRevision)
          throw new ConflictException('Plugin installation changed');
        if (purpose === 'reconfigure' && (!current || current.uninstalledAt))
          throw new ConflictException('Install the Plugin before configuring Credentials');
        const approval = await manager.getRepository(PluginSetupApproval).save({
          projectId: request.projectId,
          userId: request.userId,
          pluginId: request.pluginId,
          versionId: request.expectedVersionId,
          purpose,
          operationId: request.operationId,
          expectedRevision: request.expectedRevision,
          expiresAt: new Date(Date.now() + 15 * 60_000),
          status: 'pending',
        });
        return {
          state: 'app_required' as const,
          pluginId: request.pluginId,
          installationId: current?.id ?? null,
          revision: request.expectedRevision,
          approvalId: approval.id,
          appUrl: new URL(
            `/ui/${encodeURIComponent(request.projectId)}/plugins/${encodeURIComponent(request.pluginId)}?setupApproval=${approval.id}`,
            this.origin.getPublicOrigin()
          ).toString(),
        };
      }
      const approval = await this.approval(request, request.approvalId);
      if (
        approval.operationId !== request.operationId ||
        approval.purpose !== purpose ||
        approval.expectedRevision !== request.expectedRevision ||
        approval.versionId !== request.expectedVersionId
      )
        throw new ConflictException('Approval does not match this intent');
      if (
        approval.status !== 'completed' ||
        !approval.installationId ||
        approval.completedRevision === null
      )
        throw new ConflictException('Complete the review in the app first');
      const reservation = await this.receipts.reserve(manager, this.identity(request, purpose), {
        expectedRevision: request.expectedRevision,
        expectedVersionId: request.expectedVersionId,
        approvalId: approval.id,
        selectionsDigest: approval.selectionsDigest,
      });
      const authorizedInstallation = await this.installations.findOne(
        request.pluginId,
        request.projectId,
        request.userId
      );
      if (
        authorizedInstallation &&
        !authorizedInstallation.uninstalledAt &&
        plugin.currentVersionId
      ) {
        const version = await this.versions.findById(plugin.currentVersionId);
        if (version)
          await this.bindings.assertConsumerReady({
            ...request,
            consumerType: 'plugin-installation',
            consumerId: authorizedInstallation.id,
            requirements: version.credentialRequirements ?? [],
          });
      }
      if (!reservation.claimed && reservation.receipt.status !== 'completed')
        return this.outcome(request.pluginId, null, request.expectedRevision, 'incomplete');
      if (!reservation.claimed)
        return this.outcome(
          request.pluginId,
          reservation.receipt.result!.resourceId,
          reservation.receipt.result!.revision!
        );
      const current = await this.installations.findOne(
        request.pluginId,
        request.projectId,
        request.userId
      );
      if (
        !current ||
        current.id !== approval.installationId ||
        current.revision !== approval.completedRevision ||
        current.uninstalledAt ||
        plugin.currentVersionId !== approval.versionId ||
        plugin.suspendedAt
      )
        throw new ConflictException('Approved Plugin setup changed; review again');
      await this.receipts.complete(manager, reservation.receipt.id, {
        resourceId: current.id,
        revision: current.revision,
      });
      return this.outcome(request.pluginId, current.id, current.revision);
    });
  }

  /** Called only by the app-authenticated controller after the existing review dialog. */
  async complete(
    context: AuthorizationContext,
    pluginId: string,
    approvalId: string,
    versionId: string | null,
    selections: Readonly<Record<string, string | null>>
  ): Promise<void> {
    this.appActor(context);
    const pending = await this.dataSource.getRepository(PluginSetupApproval).findOneBy({
      id: approvalId,
      projectId: context.projectId,
      userId: context.userId,
      pluginId,
    });
    if (pending?.status === 'completed') {
      const ordered = Object.fromEntries(
        Object.entries(selections).sort(([a], [b]) => a.localeCompare(b))
      );
      const digest = createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
      if (pending.versionId !== versionId || pending.selectionsDigest !== digest)
        throw new ConflictException('Review was already completed with different intent');
      await this.mutate(
        {
          projectId: context.projectId,
          userId: context.userId,
          roles: context.roles ?? [],
          pluginId,
          operationId: pending.operationId,
          expectedRevision: pending.expectedRevision,
          expectedVersionId: versionId,
          approvalId,
        },
        pending.purpose
      );
      return;
    }
    if (!pending || pending.status !== 'pending' || pending.expiresAt.getTime() <= Date.now())
      throw new ConflictException('Plugin review expired, revoked or is no longer pending');
    await this.install.prepareReviewedInstall(pluginId);
    return runInTransaction(async () => {
      const approval = await this.approval({ ...context, pluginId }, approvalId);
      if (approval.status !== 'pending' || versionId !== approval.versionId)
        throw new ConflictException('Review is no longer current');
      const ordered = Object.fromEntries(
        Object.entries(selections).sort(([a], [b]) => a.localeCompare(b))
      );
      const selectionsDigest = createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
      const operation = { ...context, pluginId, operationId: approval.operationId };
      const reservation = await this.receipts.reserve(
        this.manager(),
        this.identity(operation, approval.purpose),
        {
          expectedRevision: approval.expectedRevision,
          expectedVersionId: approval.versionId,
          approvalId: approval.id,
          selectionsDigest,
        }
      );
      if (!reservation.claimed)
        throw new ConflictException('Review operation was already completed');
      const claimed = await this.manager()
        .getRepository(PluginSetupApproval)
        .update({ id: approval.id, status: 'pending' }, { status: 'completed' });
      if (claimed.affected !== 1) throw new ConflictException('Review is no longer pending');
      // The normal app install path validates current requirements and selected Credential access.
      const installed = await this.install.commitReviewed(
        new InstallPluginCommand(
          pluginId,
          versionId,
          context,
          selections,
          approval.expectedRevision
        )
      );
      const current = await this.installations.findById(installed.installationId);
      if (!current) throw new ConflictException('Plugin installation disappeared');
      await this.receipts.complete(this.manager(), reservation.receipt.id, {
        resourceId: current.id,
        revision: current.revision,
      });
      await this.manager().getRepository(PluginSetupApproval).update(approval.id, {
        installationId: current.id,
        completedRevision: current.revision,
        completedAt: new Date(),
        selectionsDigest,
      });
    });
  }

  async revoke(context: AuthorizationContext, pluginId: string, approvalId: string): Promise<void> {
    this.appActor(context);
    await runInTransaction(async () => {
      const approval = await this.approval({ ...context, pluginId }, approvalId, true);
      await this.manager()
        .getRepository(PluginSetupApproval)
        .update(approval.id, { status: 'revoked' });
    });
  }

  async uninstall(request: PluginUninstallRequest): Promise<PluginSetupMutationDto> {
    this.actor(request);
    this.revision(request.expectedRevision);
    if (!request.operationId?.trim() || request.operationId.length > 255)
      throw new BadRequestException('operationId must be bounded and nonempty');
    return runInTransaction(async () => {
      const manager = this.manager();
      const reservation = await this.receipts.reserve(
        manager,
        this.identity(request, 'uninstall'),
        { expectedRevision: request.expectedRevision }
      );
      if (!reservation.claimed)
        return this.outcome(
          request.pluginId,
          reservation.receipt.result?.resourceId ?? null,
          reservation.receipt.result?.revision ?? request.expectedRevision,
          reservation.receipt.status === 'completed' ? 'completed' : 'incomplete'
        );
      await this.uninstallService.run(
        new UninstallPluginCommand(request.pluginId, request, request.expectedRevision)
      );
      const current = await this.installations.findOne(
        request.pluginId,
        request.projectId,
        request.userId
      );
      if (!current) throw new NotFoundException('Plugin installation was not found');
      await this.receipts.complete(manager, reservation.receipt.id, {
        resourceId: current.id,
        revision: current.revision,
        deleted: true,
      });
      return this.outcome(request.pluginId, current.id, current.revision);
    });
  }

  private async approval(
    actor: { projectId: string; userId: string; pluginId: string },
    id: string,
    includeExpired = false
  ) {
    const approval = await this.manager().getRepository(PluginSetupApproval).findOneBy({
      id,
      projectId: actor.projectId,
      userId: actor.userId,
      pluginId: actor.pluginId,
    });
    if (!approval) throw new NotFoundException('Plugin review was not found');
    if (
      !includeExpired &&
      (approval.status === 'revoked' ||
        (approval.status === 'pending' && approval.expiresAt.getTime() <= Date.now()))
    )
      throw new ConflictException('Plugin review expired or was revoked');
    return approval;
  }
  private outcome(
    pluginId: string,
    installationId: string | null,
    revision: number,
    state: 'completed' | 'incomplete' = 'completed'
  ): PluginSetupMutationDto {
    return { state, pluginId, installationId, revision, approvalId: null, appUrl: null };
  }
  private manager(): EntityManager {
    const manager = this.dataSource.manager;
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Plugin setup requires the ambient main transaction');
    return manager;
  }
  private actor(actor: { projectId: string; userId: string; roles?: readonly string[] }) {
    if (
      !actor.projectId?.trim() ||
      !actor.userId?.trim() ||
      !actor.roles?.some(role => role === 'admin' || role === 'editor')
    )
      throw new ForbiddenException('Current project admin or editor is required');
  }
  private appActor(actor: AuthorizationContext) {
    this.actor(actor);
    if (
      actor.apiKeyId ||
      actor.pluginId ||
      actor.installationId ||
      actor.executionId ||
      actor.viewOnly
    )
      throw new ForbiddenException('Complete this review in the app');
  }
  private revision(revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new BadRequestException('expectedRevision must be a nonnegative safe integer');
  }
  private identity(
    actor: { projectId: string; userId: string; pluginId: string; operationId: string },
    action: string
  ) {
    return {
      projectId: actor.projectId,
      userId: actor.userId,
      action: `plugin.${action}`,
      resourceId: actor.pluginId,
      operationId: actor.operationId,
    };
  }
}
