import { Injectable, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { DestinationContext } from '../../entities/destination-context.entity';
import { MemberRoleScope } from '../../entities/member-role-scope.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextService } from './context.service';
import { AccessDecisionService } from '../access-decision/access-decision.service';
import { EntityType, OwnerStatus } from '../access-decision/access-decision.types';
import { UserProvisioningContextSettingsService } from './user-provisioning-context-settings.service';

@Injectable()
export class ContextAccessService {
  constructor(
    @InjectRepository(DataMartContext)
    private readonly dataMartContextRepository: Repository<DataMartContext>,
    @InjectRepository(StorageContext)
    private readonly storageContextRepository: Repository<StorageContext>,
    @InjectRepository(DestinationContext)
    private readonly destinationContextRepository: Repository<DestinationContext>,
    @InjectRepository(MemberRoleScope)
    private readonly memberRoleScopeRepository: Repository<MemberRoleScope>,
    @InjectRepository(MemberRoleContext)
    private readonly memberRoleContextRepository: Repository<MemberRoleContext>,
    private readonly contextService: ContextService,
    private readonly userProvisioningContextSettingsService: UserProvisioningContextSettingsService,
    @Inject(forwardRef(() => AccessDecisionService))
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async updateDataMartContexts(
    dataMartId: string,
    projectId: string,
    contextIds: string[],
    userId: string,
    roles: string[]
  ): Promise<void> {
    const isAdmin = roles.includes('admin');

    if (!isAdmin) {
      const ownerStatus = await this.accessDecisionService.getOwnerStatus(
        userId,
        EntityType.DATA_MART,
        dataMartId
      );

      const isTechOwnerWithEditorRole =
        ownerStatus === OwnerStatus.TECH_OWNER && roles.includes('editor');

      if (!isTechOwnerWithEditorRole) {
        throw new ForbiddenException(
          'Only Data Mart Technical Owners with Technical User role or Project Admins can manage Data Mart contexts'
        );
      }
    }

    await this.contextService.validateContextIds(contextIds, projectId);
    await this.dataMartContextRepository.delete({ dataMartId });
    if (contextIds.length > 0) {
      await this.dataMartContextRepository.save(
        contextIds.map(contextId => ({ dataMartId, contextId }))
      );
    }
  }

  @Transactional()
  async updateStorageContexts(
    storageId: string,
    projectId: string,
    contextIds: string[],
    userId: string,
    roles: string[]
  ): Promise<void> {
    const isAdmin = roles.includes('admin');

    if (!isAdmin) {
      const ownerStatus = await this.accessDecisionService.getOwnerStatus(
        userId,
        EntityType.STORAGE,
        storageId
      );

      const isOwnerWithEditorRole = ownerStatus === OwnerStatus.OWNER && roles.includes('editor');

      if (!isOwnerWithEditorRole) {
        throw new ForbiddenException(
          'Only Data Storage Owners with Technical User role or Project Admins can manage Data Storage contexts'
        );
      }
    }

    await this.contextService.validateContextIds(contextIds, projectId);
    await this.storageContextRepository.delete({ storageId });
    if (contextIds.length > 0) {
      await this.storageContextRepository.save(
        contextIds.map(contextId => ({ storageId, contextId }))
      );
    }
  }

  @Transactional()
  async updateDestinationContexts(
    destinationId: string,
    projectId: string,
    contextIds: string[],
    userId: string,
    roles: string[]
  ): Promise<void> {
    const isAdmin = roles.includes('admin');

    if (!isAdmin) {
      const ownerStatus = await this.accessDecisionService.getOwnerStatus(
        userId,
        EntityType.DESTINATION,
        destinationId
      );

      if (ownerStatus !== OwnerStatus.OWNER) {
        throw new ForbiddenException(
          'Only Data Destination Owners or Project Admins can manage Data Destination contexts'
        );
      }
    }

    await this.contextService.validateContextIds(contextIds, projectId);
    await this.destinationContextRepository.delete({ destinationId });
    if (contextIds.length > 0) {
      await this.destinationContextRepository.save(
        contextIds.map(contextId => ({ destinationId, contextId }))
      );
    }
  }

  async getRoleScope(userId: string, projectId: string): Promise<RoleScope> {
    const record = await this.memberRoleScopeRepository.findOne({
      where: { userId, projectId },
    });

    if (record) {
      return record.roleScope;
    }

    return this.userProvisioningContextSettingsService.applyDefaultScopeToMember(userId, projectId);
  }

  async getMemberContextIds(userId: string, projectId: string): Promise<string[]> {
    const records = await this.memberRoleContextRepository.find({
      where: { userId, projectId },
    });

    return records.map(r => r.contextId);
  }

  async updateMemberRoleScope(
    targetUserId: string,
    projectId: string,
    roleScope: RoleScope
  ): Promise<void> {
    await this.memberRoleScopeRepository.upsert({ userId: targetUserId, projectId, roleScope }, [
      'userId',
      'projectId',
    ]);
  }

  @Transactional()
  async updateMemberContexts(
    targetUserId: string,
    projectId: string,
    contextIds: string[]
  ): Promise<void> {
    await this.contextService.validateContextIds(contextIds, projectId);
    await this.memberRoleContextRepository.delete({
      userId: targetUserId,
      projectId,
    });
    if (contextIds.length > 0) {
      await this.memberRoleContextRepository.save(
        contextIds.map(contextId => ({
          userId: targetUserId,
          projectId,
          contextId,
        }))
      );
    }
  }

  @Transactional()
  async updateMember(
    targetUserId: string,
    projectId: string,
    payload: {
      role: ProjectRole;
      roleScope: RoleScope;
      contextIds: string[];
    }
  ): Promise<void> {
    // Validate before any DB writes so a stale UI sending invalid contextIds
    // for an admin (where they will be stripped to []) still 400s upfront,
    // matching the validation-first pattern used by every other public
    // mutation on this service.
    if (payload.contextIds.length > 0) {
      await this.contextService.validateContextIds(payload.contextIds, projectId);
    }

    const isAdminRole = payload.role === ProjectRole.ADMIN;
    const effectiveScope = isAdminRole ? RoleScope.ENTIRE_PROJECT : payload.roleScope;
    const effectiveContextIds = isAdminRole ? [] : payload.contextIds;

    await this.updateMemberContexts(targetUserId, projectId, effectiveContextIds);
    await this.updateMemberRoleScope(targetUserId, projectId, effectiveScope);
  }

  /**
   * Replace the set of members bound to a single context. The authoritative
   * unit of edit here is the (context × member) pair — NOT the member — so
   * `member_role_scope` for unaffected members is never touched.
   *
   * Per spec (stage 4, §"Participation rules"): a member with
   * scope=selected_contexts and zero contexts is a valid state — that member
   * simply gets no shared non-owner access through Context matching. We do NOT
   * silently upgrade their scope on last-binding removal.
   */
  @Transactional()
  async setContextMembers(
    contextId: string,
    projectId: string,
    assignedUserIds: string[]
  ): Promise<void> {
    // Single-context lookup: surface a 404 when the context does not belong
    // to the project. The bulk validateContextIds() helper would return 400
    // here, which is wrong for "context not found".
    await this.contextService.getByIdAndProject(contextId, projectId);

    const currentBindings = await this.memberRoleContextRepository.find({
      where: { contextId, projectId },
    });
    const currentUserIds = new Set(currentBindings.map(r => r.userId));
    const requestedUserIds = new Set(assignedUserIds);

    const toAdd = [...requestedUserIds].filter(u => !currentUserIds.has(u));
    const toRemove = [...currentUserIds].filter(u => !requestedUserIds.has(u));

    if (toAdd.length > 0) {
      await this.memberRoleContextRepository.save(
        toAdd.map(userId => ({ userId, projectId, contextId }))
      );
    }

    if (toRemove.length > 0) {
      await this.memberRoleContextRepository.delete(
        toRemove.map(userId => ({ userId, projectId, contextId }))
      );
    }
  }

  /**
   * Clear member scope + contexts on removal. Invoked after the IDP provider
   * confirms the member was removed from the project. Safe to call for a member
   * that has no bindings — both deletes are idempotent.
   */
  @Transactional()
  async removeMemberBindings(userId: string, projectId: string): Promise<void> {
    await this.memberRoleContextRepository.delete({ userId, projectId });
    await this.memberRoleScopeRepository.delete({ userId, projectId });
  }

  async hasContextOverlap(
    userId: string,
    entityType: EntityType,
    entityId: string,
    projectId: string
  ): Promise<boolean> {
    const memberContexts = await this.memberRoleContextRepository.find({
      where: { userId, projectId },
    });

    if (memberContexts.length === 0) {
      return false;
    }

    const memberContextIds = memberContexts.map(mc => mc.contextId);

    const { repository, entityIdColumn } = this.getEntityContextConfig(entityType);
    const count = await repository
      .createQueryBuilder('ec')
      .innerJoin('context', 'c', 'c.id = ec.context_id AND c.deletedAt IS NULL')
      .where(`ec.${entityIdColumn} = :entityId`, { entityId })
      .andWhere('ec.context_id IN (:...memberContextIds)', { memberContextIds })
      .getCount();

    return count > 0;
  }

  private getEntityContextConfig(entityType: EntityType): {
    repository: Repository<DataMartContext | StorageContext | DestinationContext>;
    entityIdColumn: string;
  } {
    switch (entityType) {
      case EntityType.DATA_MART:
        return {
          repository: this.dataMartContextRepository,
          entityIdColumn: 'data_mart_id',
        };
      case EntityType.STORAGE:
        return {
          repository: this.storageContextRepository,
          entityIdColumn: 'storage_id',
        };
      case EntityType.DESTINATION:
        return {
          repository: this.destinationContextRepository,
          entityIdColumn: 'destination_id',
        };
      default:
        throw new Error(`Unsupported entity type for context overlap: ${entityType}`);
    }
  }
}
