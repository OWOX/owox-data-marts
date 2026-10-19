import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import type { Role } from '@owox/idp-protocol';
import { MutationReceiptService } from '../../../common/mutations/mutation-receipt.service';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import type {
  ContextChange,
  ContextMutation,
  ContextMutationResult,
  ContextChangeImpact,
  ContextChangeEffects,
} from '../../dto/domain/context-mutation.dto';
import type { ContextSetupActor } from '../../dto/domain/mcp-context-setup.dto';
import { Context } from '../../entities/context.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { DestinationContext } from '../../entities/destination-context.entity';
import { CredentialContext } from '../../credentials/entities/credential-context.entity';
import { EntityType } from '../../services/access-decision/access-decision.types';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataDestination } from '../../entities/data-destination.entity';
import { Credential } from '../../credentials/entities/credential.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { UserProvisioningContextSettingsContext } from '../../entities/user-provisioning-context-settings-context.entity';
import { RoleScope } from '../../enums/role-scope.enum';
import { ProjectRole } from '../../enums/project-role.enum';
import { ContextService } from '../../services/context/context.service';
import { ContextAccessService } from '../../services/context/context-access.service';
import { UserProvisioningContextSettingsService } from '../../services/context/user-provisioning-context-settings.service';
import {
  contextImpactDigest,
  contextRevision,
  lockContextReferences,
} from '../../services/context/context-reference-guard';

@Injectable()
export class MutateContextSetupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly idp: IdpProjectionsFacade,
    private readonly contexts: ContextService,
    private readonly assignments: ContextAccessService,
    private readonly defaults: UserProvisioningContextSettingsService,
    private readonly receipts: MutationReceiptService
  ) {}

  async authorize(actor: ContextSetupActor, admin: boolean): Promise<ContextSetupActor> {
    if (!actor.userId?.trim() || !actor.projectId?.trim())
      throw new ForbiddenException('Project actor required');
    const project = await this.idp.getProjectForUser(actor.userId, actor.projectId);
    const roles = project.roles as Role[];
    if (
      project.id !== actor.projectId ||
      (project.status !== undefined && project.status !== 'active') ||
      !roles?.some(role => role === 'admin' || (!admin && role === 'editor'))
    ) {
      throw new ForbiddenException('Current project authority required');
    }
    return { ...actor, roles };
  }

  async impact(actor: ContextSetupActor, change: ContextChange): Promise<ContextChangeImpact> {
    actor = await this.authorize(actor, change.action !== 'set_entity_contexts');
    const members =
      (change.action === 'set_entity_contexts' && !actor.roles.includes('admin')) ||
      change.action === 'update_context'
        ? []
        : await this.idp.getProjectMembersOrThrow(actor.projectId);
    let defaultRole: ProjectRole | undefined;
    if (change.action === 'set_context_defaults') {
      const settings = await this.idp.getUserProvisioningSettings(actor.projectId, actor.userId);
      if (
        !settings.isApplicable ||
        settings.organization?.mainProjectName !== actor.projectId ||
        !settings.settings
      )
        throw new ForbiddenException('Context defaults require the organization main project');
      defaultRole = settings.settings.defaultRole as ProjectRole;
    }
    return this.review(
      actor,
      change,
      members.map(member => ({ userId: member.userId, role: member.role })),
      defaultRole
    );
  }

  @Transactional()
  private async review(
    actor: ContextSetupActor,
    change: ContextChange,
    members: { userId: string; role: string }[],
    defaultRole?: ProjectRole
  ): Promise<ContextChangeImpact> {
    const manager = this.dataSource.manager;
    const revision = await lockContextReferences(manager, actor.projectId, undefined, false);
    const effects = await this.effects(manager, actor, change, members, defaultRole);
    return {
      revision,
      revisionAggregate: 'project_context_configuration',
      action: change.action,
      target: this.target(change),
      change,
      effects,
      impactDigest: contextImpactDigest(
        actor.projectId,
        revision,
        change.action,
        this.target(change),
        { change, effects }
      ),
    };
  }

  async run(actor: ContextSetupActor, command: ContextMutation): Promise<ContextMutationResult> {
    actor = await this.authorize(actor, command.action !== 'set_entity_contexts');
    if (
      command.action !== 'create_context' &&
      (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0)
    )
      throw new BadRequestException('expectedRevision is required');
    if ('roleScope' in command && !Object.values(RoleScope).includes(command.roleScope))
      throw new BadRequestException('Invalid roleScope');
    if (command.action === 'create_context' || command.action === 'update_context') {
      if (command.action === 'create_context' || command.name !== undefined) {
        if (!command.name?.trim() || command.name.length > 255)
          throw new BadRequestException('Context name is required and limited to 255 characters');
      }
    }
    const members =
      command.action === 'set_context_members' ||
      command.action === 'set_member_context_scope' ||
      command.action === 'set_context_defaults' ||
      command.action === 'delete_context' ||
      (command.action === 'set_entity_contexts' && actor.roles.includes('admin'))
        ? await this.idp.getProjectMembersOrThrow(actor.projectId)
        : [];
    let defaultRole: ProjectRole | undefined;
    if (command.action === 'set_context_defaults') {
      const settings = await this.idp.getUserProvisioningSettings(actor.projectId, actor.userId);
      if (
        !settings.isApplicable ||
        settings.organization?.mainProjectName !== actor.projectId ||
        !settings.settings
      ) {
        throw new ForbiddenException('Context defaults require the organization main project');
      }
      defaultRole = settings.settings.defaultRole as ProjectRole;
    }
    return this.write(
      actor,
      command,
      members.map(member => ({ userId: member.userId, role: member.role })),
      defaultRole
    );
  }

  @Transactional()
  private async write(
    actor: ContextSetupActor,
    command: ContextMutation,
    members: { userId: string; role: string }[],
    defaultRole?: ProjectRole
  ): Promise<ContextMutationResult> {
    const manager = this.dataSource.manager;
    const target = this.target(command);
    // Acquire the reference guard before receipt reads can establish a MySQL repeatable-read snapshot.
    await lockContextReferences(manager, actor.projectId, undefined, false);
    const isReceipt = command.action === 'create_context' || command.action === 'delete_context';
    let receiptId: string | undefined;
    if (isReceipt) {
      if (!command.operationId?.trim() || command.operationId.length > 255)
        throw new BadRequestException('operationId is required');
      const reservation = await this.receipts.reserve(
        manager,
        {
          projectId: actor.projectId,
          userId: actor.userId,
          action: command.action,
          resourceId: target,
          operationId: command.operationId,
        },
        this.intent(command)
      );
      if (!reservation.claimed) {
        const result = reservation.receipt.result;
        return {
          resourceId: result?.resourceId ?? target,
          revision: result?.revision ?? 0,
          revisionAggregate: 'project_context_configuration',
          state: reservation.receipt.status,
          ...(result?.deleted ? { deleted: true } : {}),
        };
      }
      receiptId = reservation.receipt.id;
    }
    await lockContextReferences(
      manager,
      actor.projectId,
      command.action === 'create_context' ? undefined : command.expectedRevision,
      false
    );
    if (command.action !== 'create_context') {
      const change = this.change(command);
      const effects = await this.effects(manager, actor, change, members, defaultRole);
      const expectedDigest = contextImpactDigest(
        actor.projectId,
        command.expectedRevision,
        command.action,
        target,
        { change, effects }
      );
      if (command.impactDigest !== expectedDigest)
        throw new ConflictException(
          'Reviewed Context impact does not match current dependencies and this change'
        );
    }
    let resourceId = target;
    switch (command.action) {
      case 'create_context': {
        const result = await this.contexts.create(
          actor.projectId,
          actor.userId,
          command.name.trim(),
          command.description
        );
        resourceId = result.id;
        break;
      }
      case 'update_context': {
        const existing = await this.contexts.getByIdAndProject(command.contextId, actor.projectId);
        await this.contexts.update(
          command.contextId,
          actor.projectId,
          command.name?.trim() ?? existing.name,
          command.description === undefined ? existing.description : command.description
        );
        break;
      }
      case 'set_entity_contexts': {
        const config = {
          DATA_MART: DataMart,
          STORAGE: DataStorage,
          DESTINATION: DataDestination,
          CREDENTIAL: Credential,
        };
        const resource = await manager.getRepository(config[command.entityType]).findOne({
          where: { id: command.entityId, projectId: actor.projectId },
          select: ['id'],
          loadEagerRelations: false,
        });
        if (!resource) throw new NotFoundException('Resource not found in this project');
        const ids = [...new Set(command.contextIds)];
        const methods = {
          DATA_MART: 'updateDataMartContexts',
          STORAGE: 'updateStorageContexts',
          DESTINATION: 'updateDestinationContexts',
          CREDENTIAL: 'updateCredentialContexts',
        } as const;
        await this.assignments[methods[command.entityType]](
          command.entityId,
          actor.projectId,
          ids,
          actor.userId,
          actor.roles
        );
        break;
      }
      case 'set_context_members': {
        const selected = [...new Set(command.assignedUserIds)];
        if (selected.some(id => !members.some(member => member.userId === id)))
          throw new BadRequestException('Unknown project member');
        await this.assignments.setContextMembers(
          command.contextId,
          actor.projectId,
          selected.filter(id => members.find(member => member.userId === id)?.role !== 'admin'),
          undefined,
          members.filter(member => member.role !== 'admin').map(member => member.userId)
        );
        break;
      }
      case 'set_member_context_scope': {
        const member = members.find(member => member.userId === command.memberId);
        if (!member) throw new BadRequestException('Unknown project member');
        await this.assignments.updateMember(command.memberId, actor.projectId, {
          role: member.role as ProjectRole,
          roleScope: command.roleScope,
          contextIds: [...new Set(command.contextIds)],
        });
        break;
      }
      case 'set_context_defaults': {
        const normalized = await this.defaults.normalizeAndValidate(
          actor.projectId,
          defaultRole!,
          command.roleScope,
          [...new Set(command.contextIds)]
        );
        await this.defaults.saveDefaultSettings(
          actor.projectId,
          normalized,
          members.map(member => member.userId)
        );
        break;
      }
      case 'delete_context':
        await this.contexts.delete(command.contextId, actor.projectId);
        break;
    }
    const revision = await contextRevision(manager, actor.projectId);
    const deleted = command.action === 'delete_context';
    if (receiptId)
      await this.receipts.complete(manager, receiptId, {
        resourceId,
        revision,
        ...(deleted ? { deleted: true } : {}),
      });
    return {
      resourceId,
      revision,
      revisionAggregate: 'project_context_configuration',
      state: 'completed',
      ...(deleted ? { deleted: true } : {}),
    };
  }

  private async effects(
    manager: EntityManager,
    actor: ContextSetupActor,
    change: ContextChange,
    members: { userId: string; role: string }[],
    defaultRole?: ProjectRole
  ): Promise<ContextChangeEffects> {
    const projectId = actor.projectId;
    const effects: ContextChangeEffects = {
      defaultRole: defaultRole ?? null,
      currentContextIds: [],
      proposedContextIds: [],
      currentMemberIds: [],
      proposedMemberIds: [],
      affectedMemberIds: [],
      currentScope: null,
      proposedScope: null,
      blockers: {
        dataMartCount: 0,
        storageCount: 0,
        destinationCount: 0,
        credentialCount: 0,
        memberCount: 0,
        userProvisioningDefaultsCount: 0,
      },
    };
    if ('contextId' in change) {
      if (!(await manager.getRepository(Context).findOneBy({ id: change.contextId, projectId })))
        throw new NotFoundException('Context not found in this project');
    }
    if (change.action === 'set_entity_contexts') {
      await this.assignments.assertCanSetContexts(
        change.entityType as EntityType,
        change.entityId,
        projectId,
        actor.userId,
        actor.roles
      );
      const configs = {
        DATA_MART: { entity: DataMartContext, key: 'dataMartId' },
        STORAGE: { entity: StorageContext, key: 'storageId' },
        DESTINATION: { entity: DestinationContext, key: 'destinationId' },
        CREDENTIAL: { entity: CredentialContext, key: 'credentialId' },
      };
      const config = configs[change.entityType];
      const rows = await manager
        .getRepository(config.entity)
        .findBy({ [config.key]: change.entityId });
      effects.currentContextIds = rows.map(row => row.contextId).sort();
      effects.proposedContextIds = [...new Set(change.contextIds)].sort();
      // Only admins receive member identities in Context access impact.
      if (actor.roles.includes('admin')) {
        for (const member of members.filter(member => member.role !== 'admin')) {
          const scope = await this.assignments.getReadOnlyMemberScope(member.userId, projectId);
          if (scope.roleScope !== RoleScope.SELECTED_CONTEXTS) continue;
          const before = effects.currentContextIds.some(id => scope.contextIds.includes(id));
          const after = effects.proposedContextIds.some(id => scope.contextIds.includes(id));
          if (before !== after) effects.affectedMemberIds.push(member.userId);
        }
        effects.affectedMemberIds.sort();
      }
    } else if (change.action === 'set_context_members') {
      const rows = await manager
        .getRepository(MemberRoleContext)
        .findBy({ projectId, contextId: change.contextId });
      const currentMemberIds = new Set(rows.map(row => row.userId));
      for (const member of members.filter(member => member.role !== 'admin')) {
        const scope = await this.assignments.getReadOnlyMemberScope(member.userId, projectId);
        if (
          scope.roleScope === RoleScope.SELECTED_CONTEXTS &&
          scope.contextIds.includes(change.contextId)
        )
          currentMemberIds.add(member.userId);
      }
      effects.currentMemberIds = [...currentMemberIds].sort();
      effects.proposedMemberIds = [...new Set(change.assignedUserIds)]
        .filter(id => members.find(member => member.userId === id)?.role !== 'admin')
        .sort();
      effects.affectedMemberIds = [
        ...new Set([...effects.currentMemberIds, ...effects.proposedMemberIds]),
      ]
        .filter(
          id => effects.currentMemberIds.includes(id) !== effects.proposedMemberIds.includes(id)
        )
        .sort();
    } else if (change.action === 'set_member_context_scope') {
      const member = members.find(member => member.userId === change.memberId);
      if (!member) throw new BadRequestException('Unknown project member');
      const scope = await this.assignments.getReadOnlyMemberScope(change.memberId, projectId);
      effects.currentContextIds = [...scope.contextIds].sort();
      effects.currentScope = scope.roleScope;
      effects.proposedScope = member.role === 'admin' ? RoleScope.ENTIRE_PROJECT : change.roleScope;
      effects.proposedContextIds =
        effects.proposedScope === RoleScope.ENTIRE_PROJECT
          ? []
          : [...new Set(change.contextIds)].sort();
      effects.affectedMemberIds = [change.memberId];
    } else if (change.action === 'set_context_defaults') {
      const current = await this.defaults.getDefaultSettings(projectId);
      effects.currentScope = current.roleScope;
      effects.currentContextIds = [...current.contextIds].sort();
      effects.proposedScope =
        defaultRole === ProjectRole.ADMIN ? RoleScope.ENTIRE_PROJECT : change.roleScope;
      effects.proposedContextIds =
        effects.proposedScope === RoleScope.ENTIRE_PROJECT
          ? []
          : [...new Set(change.contextIds)].sort();
      // These existing members will be materialized with their old effective scope before defaults change.
      effects.affectedMemberIds = members.map(member => member.userId).sort();
    } else if (change.action === 'delete_context') {
      const where = { contextId: change.contextId };
      effects.blockers = {
        dataMartCount: await manager.getRepository(DataMartContext).countBy(where),
        storageCount: await manager.getRepository(StorageContext).countBy(where),
        destinationCount: await manager.getRepository(DestinationContext).countBy(where),
        credentialCount: await manager.getRepository(CredentialContext).countBy(where),
        memberCount: await manager
          .getRepository(MemberRoleContext)
          .countBy({ ...where, projectId }),
        userProvisioningDefaultsCount: await manager
          .getRepository(UserProvisioningContextSettingsContext)
          .countBy({ ...where, projectId }),
      };
      const bindings = await manager
        .getRepository(MemberRoleContext)
        .findBy({ ...where, projectId });
      effects.currentMemberIds = bindings.map(row => row.userId).sort();
      for (const binding of bindings) {
        const role = members.find(member => member.userId === binding.userId)?.role;
        if (!role || role === 'admin') continue;
        const scope = await this.assignments.getReadOnlyMemberScope(binding.userId, projectId);
        if (scope.roleScope === RoleScope.SELECTED_CONTEXTS && scope.contextIds.length === 1)
          effects.affectedMemberIds.push(binding.userId);
      }
      effects.affectedMemberIds.sort();
    }
    return effects;
  }

  private target(command: ContextMutation | ContextChange): string {
    if ('contextId' in command) return command.contextId;
    if ('entityId' in command) return `${command.entityType}:${command.entityId}`;
    if ('memberId' in command) return command.memberId;
    return command.action === 'create_context' ? 'contexts' : 'context-defaults';
  }
  private change(command: ContextMutation): ContextChange {
    const {
      expectedRevision: _revision,
      impactDigest: _digest,
      operationId: _operation,
      ...change
    } = command as Exclude<ContextMutation, { action: 'create_context' }>;
    return change;
  }
  private intent(command: ContextMutation): Record<string, unknown> {
    return JSON.parse(JSON.stringify(command)) as Record<string, unknown>;
  }
}
