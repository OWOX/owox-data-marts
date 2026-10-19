import {
  contextImpactDigest,
  contextRevision,
} from '../../services/context/context-reference-guard';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { Credential } from '../../credentials/entities/credential.entity';
import { CredentialContext } from '../../credentials/entities/credential-context.entity';
import type {
  ContextDefaultsDto,
  ContextResourceDto,
  ContextResourceQuery,
  ContextResourceType,
  ContextSetupActor,
  ContextSetupDto,
  ContextSetupImpactDto,
  ContextSetupMemberDto,
} from '../../dto/domain/mcp-context-setup.dto';
import { Context } from '../../entities/context.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataDestination } from '../../entities/data-destination.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { DestinationContext } from '../../entities/destination-context.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { UserProvisioningContextSettingsContext } from '../../entities/user-provisioning-context-settings-context.entity';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextSetupMapper } from '../../mappers/context-setup.mapper';
import { AccessDecisionService } from '../../services/access-decision/access-decision.service';
import {
  Action,
  EntityType,
  OwnerStatus,
} from '../../services/access-decision/access-decision.types';
import { ContextAccessService } from '../../services/context/context-access.service';
import { UserProvisioningContextSettingsService } from '../../services/context/user-provisioning-context-settings.service';

@Injectable()
export class ReadContextSetupService {
  constructor(
    @InjectRepository(Context) private readonly contexts: Repository<Context>,
    @InjectRepository(DataMart) private readonly dataMarts: Repository<DataMart>,
    @InjectRepository(DataStorage) private readonly storages: Repository<DataStorage>,
    @InjectRepository(DataDestination) private readonly destinations: Repository<DataDestination>,
    @InjectRepository(Credential) private readonly credentials: Repository<Credential>,
    @InjectRepository(DataMartContext)
    private readonly dataMartContexts: Repository<DataMartContext>,
    @InjectRepository(StorageContext) private readonly storageContexts: Repository<StorageContext>,
    @InjectRepository(DestinationContext)
    private readonly destinationContexts: Repository<DestinationContext>,
    @InjectRepository(CredentialContext)
    private readonly credentialContexts: Repository<CredentialContext>,
    @InjectRepository(MemberRoleContext)
    private readonly memberContexts: Repository<MemberRoleContext>,
    @InjectRepository(UserProvisioningContextSettingsContext)
    private readonly provisioningContexts: Repository<UserProvisioningContextSettingsContext>,
    private readonly idp: IdpProjectionsFacade,
    private readonly contextAccess: ContextAccessService,
    private readonly provisioning: UserProvisioningContextSettingsService,
    private readonly access: AccessDecisionService,
    private readonly mapper: ContextSetupMapper
  ) {}

  async getContext(actor: ContextSetupActor, contextId: string): Promise<ContextSetupDto> {
    this.requireActor(actor);
    const revision = await contextRevision(this.contexts.manager, actor.projectId);
    const context = await this.getProjectContext(actor.projectId, contextId);
    const admin = actor.roles.includes('admin');
    const resources = await this.readResources(actor);
    let memberAssignments: ContextSetupMemberDto[] | null = null;
    if (admin) {
      const bindings = await this.memberContexts.find({
        where: { projectId: actor.projectId, contextId },
      });
      const memberIds = new Set(bindings.map(binding => binding.userId));
      const members = await this.readMembers(actor);
      memberAssignments = members.filter(member => memberIds.has(member.userId));
    }
    return {
      id: context.id,
      name: context.name,
      description: context.description ?? null,
      revision,
      revisionAggregate: 'project_context_configuration',
      actions: { canEdit: admin, canManageMembers: admin, canInspectImpact: admin },
      resources: resources.filter(resource => resource.contextIds.includes(contextId)),
      memberAssignments,
    };
  }

  async listResources(
    actor: ContextSetupActor,
    query: ContextResourceQuery
  ): Promise<ContextResourceDto[]> {
    this.requireActor(actor);
    if (query.contextId) await this.getProjectContext(actor.projectId, query.contextId);
    const resources = await this.readResources(actor, query.type);
    return resources
      .filter(
        resource =>
          (!query.contextId || resource.contextIds.includes(query.contextId)) &&
          this.matches(query.query, resource.id, resource.title)
      )
      .slice(query.offset, query.offset + query.limit);
  }

  async listMembers(
    actor: ContextSetupActor,
    query: { query?: string; limit: number; offset: number }
  ): Promise<ContextSetupMemberDto[]> {
    this.requireActor(actor);
    return (await this.readMembers(actor))
      .filter(member => this.matches(query.query, member.userId, member.displayName, member.email))
      .slice(query.offset, query.offset + query.limit);
  }

  async getDefaults(actor: ContextSetupActor): Promise<ContextDefaultsDto> {
    this.requireAdmin(actor);
    const revision = await contextRevision(this.contexts.manager, actor.projectId);
    const settings = await this.provisioning.getDefaultSettings(actor.projectId);
    return {
      roleScope: settings.roleScope,
      contextIds: settings.contextIds,
      revision,
      revisionAggregate: 'project_context_configuration',
      effect: 'new_members_only',
    };
  }

  async getImpact(actor: ContextSetupActor, contextId: string): Promise<ContextSetupImpactDto> {
    this.requireAdmin(actor);
    const revision = await contextRevision(this.contexts.manager, actor.projectId);
    await this.getProjectContext(actor.projectId, contextId);
    const [
      dataMartCount,
      storageCount,
      destinationCount,
      credentialCount,
      bindings,
      userProvisioningDefaultsCount,
    ] = await Promise.all([
      this.dataMartContexts.count({ where: { contextId } }),
      this.storageContexts.count({ where: { contextId } }),
      this.destinationContexts.count({ where: { contextId } }),
      this.credentialContexts.count({ where: { contextId } }),
      this.memberContexts.find({ where: { contextId, projectId: actor.projectId } }),
      this.provisioningContexts.count({ where: { contextId, projectId: actor.projectId } }),
    ]);
    const affectedMemberIds: string[] = [];
    const projectMembers = bindings.length
      ? await this.idp.getProjectMembersOrThrow(actor.projectId)
      : [];
    const contextLimitedCandidates = new Set(
      projectMembers.filter(member => member.role !== 'admin').map(member => member.userId)
    );
    for (const binding of bindings) {
      if (!contextLimitedCandidates.has(binding.userId)) continue;
      const scope = await this.contextAccess.getReadOnlyMemberScope(
        binding.userId,
        actor.projectId
      );
      if (
        scope.roleScope === RoleScope.SELECTED_CONTEXTS &&
        scope.contextIds.length === 1 &&
        scope.contextIds[0] === contextId
      ) {
        affectedMemberIds.push(binding.userId);
      }
    }
    const blockers = {
      dataMartCount,
      storageCount,
      destinationCount,
      credentialCount,
      memberCount: bindings.length,
      userProvisioningDefaultsCount,
    };
    const requiredActions: string[] = [];
    if (dataMartCount) requiredActions.push('detach_data_marts');
    if (storageCount) requiredActions.push('detach_storages');
    if (destinationCount) requiredActions.push('detach_destinations');
    if (credentialCount) requiredActions.push('detach_credentials');
    if (bindings.length) requiredActions.push('reassign_members');
    if (userProvisioningDefaultsCount) requiredActions.push('reassign_provisioning_defaults');
    return {
      contextId,
      revision,
      revisionAggregate: 'project_context_configuration',
      impactDigest: contextImpactDigest(actor.projectId, revision, 'delete_context', contextId, {
        action: 'delete_context',
        contextId,
      }),
      blockers,
      affectedMemberIds,
      detached: requiredActions.length === 0,
      requiredActions,
    };
  }

  private async readMembers(actor: ContextSetupActor): Promise<ContextSetupMemberDto[]> {
    // The permissive IdP list degrades failures to []; setup reads must propagate them.
    const revision = await contextRevision(this.contexts.manager, actor.projectId);
    const members = await this.idp.getProjectMembersOrThrow(actor.projectId);
    const result: ContextSetupMemberDto[] = [];
    for (const member of members) {
      const administration = actor.roles.includes('admin')
        ? member.role === 'admin'
          ? { roleScope: RoleScope.ENTIRE_PROJECT, contextIds: [] }
          : await this.contextAccess.getReadOnlyMemberScope(member.userId, actor.projectId)
        : null;
      const dto = this.mapper.member(member, administration);
      result.push({
        ...dto,
        administration: dto.administration ? { ...dto.administration, revision } : null,
      });
    }
    return result.sort((a, b) => a.userId.localeCompare(b.userId));
  }

  private async readResources(
    actor: ContextSetupActor,
    type?: ContextResourceType
  ): Promise<ContextResourceDto[]> {
    const revision = await contextRevision(this.contexts.manager, actor.projectId);
    const sources = [
      { type: EntityType.DATA_MART, repository: this.dataMarts },
      { type: EntityType.STORAGE, repository: this.storages },
      { type: EntityType.DESTINATION, repository: this.destinations },
      { type: EntityType.CREDENTIAL, repository: this.credentials },
    ] as const;
    const result: ContextResourceDto[] = [];
    for (const source of sources) {
      if (type && type !== source.type) continue;
      // Select only identity and Context metadata; never hydrate eager credentials.
      const resources = await source.repository
        .createQueryBuilder('resource')
        .leftJoinAndSelect('resource.contexts', 'attachment')
        .leftJoinAndSelect('attachment.context', 'context', 'context.projectId = :projectId', {
          projectId: actor.projectId,
        })
        .select(['resource.id', 'resource.title', 'attachment', 'context.id'])
        .where('resource.projectId = :projectId', { projectId: actor.projectId })
        .orderBy('resource.id', 'ASC')
        .getMany();
      for (const resource of resources) {
        if (
          !(await this.access.canAccessStored(
            actor.userId,
            actor.roles,
            source.type,
            resource.id,
            Action.SEE,
            actor.projectId
          ))
        )
          continue;
        const owner = actor.roles.includes('admin')
          ? OwnerStatus.ADMIN
          : await this.access.getOwnerStatus(actor.userId, source.type, resource.id);
        const canSetContexts =
          owner === OwnerStatus.ADMIN ||
          (source.type === EntityType.DATA_MART
            ? owner === OwnerStatus.TECH_OWNER && actor.roles.includes('editor')
            : owner === OwnerStatus.OWNER);
        result.push({
          ...this.mapper.resource(resource, source.type, canSetContexts),
          revision,
          revisionAggregate: 'project_context_configuration',
        });
      }
    }
    return result;
  }

  private getProjectContext(projectId: string, id: string): Promise<Context> {
    return this.contexts.findOne({ where: { id, projectId } }).then(context => {
      if (!context) throw new NotFoundException('Context not found in this project');
      return context;
    });
  }

  private requireActor(actor: ContextSetupActor): void {
    if (
      !actor.userId?.trim() ||
      !actor.projectId?.trim() ||
      !actor.roles?.some(role => role === 'admin' || role === 'editor')
    ) {
      throw new ForbiddenException('Context setup requires a project editor or admin');
    }
  }

  private requireAdmin(actor: ContextSetupActor): void {
    this.requireActor(actor);
    if (!actor.roles.includes('admin'))
      throw new ForbiddenException('Context administration requires a project admin');
  }

  private matches(query: string | undefined, ...values: (string | null)[]): boolean {
    return (
      !query || values.some(value => value?.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    );
  }
}
