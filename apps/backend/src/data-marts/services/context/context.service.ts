import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { ContextDto, ContextImpactDto } from '../../dto/domain/context.dto';
import { RoleScope } from '../../enums/role-scope.enum';
import { Context } from '../../entities/context.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { DestinationContext } from '../../entities/destination-context.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { MemberRoleScope } from '../../entities/member-role-scope.entity';
import { UserProvisioningContextSettingsContext } from '../../entities/user-provisioning-context-settings-context.entity';
import { ContextMapper } from '../../mappers/context.mapper';
import type { DataMartIconValue } from '../../enums/data-mart-icon.enum';
import { UserProjectionsFetcherService } from '../user-projections-fetcher.service';

/**
 * Detects unique-constraint violations across MySQL / SQLite / Postgres so the
 * `validateUniqueName` race (TOCTOU between app-level check and DB INSERT)
 * surfaces as a 409 ConflictException instead of a 500.
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; driverError?: { code?: unknown }; message?: unknown };
  const code = e.code;
  const driverCode = e.driverError?.code;
  const msg = e.message;
  return (
    code === 'ER_DUP_ENTRY' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === '23505' ||
    driverCode === 'ER_DUP_ENTRY' ||
    driverCode === 'SQLITE_CONSTRAINT_UNIQUE' ||
    driverCode === '23505' ||
    (typeof msg === 'string' && msg.includes('UNIQUE constraint failed'))
  );
}

@Injectable()
export class ContextService {
  constructor(
    @InjectRepository(Context)
    private readonly contextRepository: Repository<Context>,
    @InjectRepository(DataMartContext)
    private readonly dataMartContextRepository: Repository<DataMartContext>,
    @InjectRepository(StorageContext)
    private readonly storageContextRepository: Repository<StorageContext>,
    @InjectRepository(DestinationContext)
    private readonly destinationContextRepository: Repository<DestinationContext>,
    @InjectRepository(MemberRoleContext)
    private readonly memberRoleContextRepository: Repository<MemberRoleContext>,
    @InjectRepository(MemberRoleScope)
    private readonly memberRoleScopeRepository: Repository<MemberRoleScope>,
    @InjectRepository(UserProvisioningContextSettingsContext)
    private readonly userProvisioningContextSettingsContextRepository: Repository<UserProvisioningContextSettingsContext>,
    private readonly contextMapper: ContextMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async create(
    projectId: string,
    createdById: string,
    name: string,
    description?: string | null,
    icon: DataMartIconValue | null = null
  ): Promise<ContextDto> {
    await this.validateUniqueName(name, projectId);

    const entity = this.contextRepository.create({
      name,
      description,
      icon,
      projectId,
      createdById,
    });

    let saved: Context;
    try {
      saved = await this.contextRepository.save(entity);
    } catch (err) {
      // Race: two parallel POSTs both pass `validateUniqueName`, the second
      // one trips the DB UNIQUE index. Translate to a 409 instead of leaking
      // QueryFailedError as a 500.
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException(`Context with name "${name}" already exists in this project`);
      }
      throw err;
    }

    const userProjections = await this.userProjectionsFetcherService.fetchUserProjectionsList(
      saved.createdById ? [saved.createdById] : []
    );

    return this.contextMapper.toDomainDto(saved, userProjections);
  }

  async getDataMartContextSummaries(projectId: string, dataMartIds: string[]) {
    if (dataMartIds.length === 0) return {};
    const rows = await this.dataMartContextRepository.find({
      where: {
        dataMartId: In([...new Set(dataMartIds)]),
        context: { projectId },
        dataMart: { projectId },
      },
      relations: ['context'],
      order: { context: { name: 'ASC' } },
    });
    return this.contextMapper.toDataMartContextSummaries(rows);
  }

  async list(projectId: string): Promise<ContextDto[]> {
    const entities = await this.contextRepository.find({
      where: { projectId },
      order: { name: 'ASC' },
    });

    const creatorIds = entities
      .map(e => e.createdById)
      .filter((id): id is string => typeof id === 'string');
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(creatorIds);

    return entities.map(entity => this.contextMapper.toDomainDto(entity, userProjections));
  }

  /** `icon` undefined keeps the current icon; null resets it to the default. */
  async update(
    contextId: string,
    projectId: string,
    name?: string,
    description?: string | null,
    icon?: DataMartIconValue | null
  ): Promise<ContextDto> {
    const entity = await this.getByIdAndProject(contextId, projectId);

    const patch: Partial<Context> = {};
    if (name !== undefined) {
      await this.validateUniqueName(name, projectId, contextId);
      patch.name = name;
    }
    if (description !== undefined) {
      patch.description = description;
    }
    if (icon !== undefined) {
      patch.icon = icon;
    }

    let saved: Context;
    try {
      if (Object.keys(patch).length > 0) {
        await this.contextRepository.update({ id: contextId, projectId }, patch);
      }
      saved = await this.getByIdAndProject(contextId, projectId);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException(
          `Context with name "${name ?? entity.name}" already exists in this project`
        );
      }
      throw err;
    }

    const userProjections = await this.userProjectionsFetcherService.fetchUserProjectionsList(
      saved.createdById ? [saved.createdById] : []
    );

    return this.contextMapper.toDomainDto(saved, userProjections);
  }

  /**
   * @param nonAdminMemberIds current project members other than admins. Only
   *   their assignments can limit access, so only they are counted.
   */
  async getImpact(
    contextId: string,
    projectId: string,
    nonAdminMemberIds: ReadonlySet<string>
  ): Promise<ContextImpactDto> {
    const entity = await this.getByIdAndProject(contextId, projectId);

    const {
      counts: {
        dataMartCount,
        storageCount,
        destinationCount,
        memberCount,
        userProvisioningDefaultsCount,
      },
    } = await this.countBlockingAttachments(contextId, projectId, nonAdminMemberIds);

    // Find members with selected_contexts scope whose only context is the one being deleted
    const affectedMembers = await this.memberRoleContextRepository
      .createQueryBuilder('mrc')
      .innerJoin(
        MemberRoleScope,
        'mrs',
        'mrs.userId = mrc.userId AND mrs.projectId = mrc.projectId AND mrs.roleScope = :scope',
        { scope: RoleScope.SELECTED_CONTEXTS }
      )
      .select('mrc.userId', 'userId')
      .where('mrc.projectId = :projectId', { projectId })
      .groupBy('mrc.userId, mrc.projectId')
      .having('COUNT(*) = 1')
      .andHaving('MAX(mrc.context_id) = :contextId', { contextId })
      .getRawMany<{ userId: string }>();

    const affectedMemberIds = affectedMembers
      .map(m => m.userId)
      .filter(userId => nonAdminMemberIds.has(userId));

    return new ContextImpactDto(
      entity.id,
      entity.name,
      dataMartCount,
      storageCount,
      destinationCount,
      memberCount,
      userProvisioningDefaultsCount,
      affectedMemberIds
    );
  }

  /**
   * Per Fibery spec (`01d:54`): "a Context may be deleted only when it is
   * detached from all Project Member role assignments and all Data Marts,
   * Storages, and Destinations". The admin must manually detach first; we
   * refuse the delete here when any attachment exists. Counts are returned
   * in the conflict body so the UI can show what's blocking.
   *
   * Assignments that do not decide the member's access (see
   * `splitMemberAssignments`) are not role assignments in that sense: they
   * grant nothing and the admin cannot see them, so they do not block. They
   * are removed with the context, so a member switched back to Selected
   * contexts later does not carry a deleted context.
   *
   * @param nonAdminMemberIds current project members other than admins.
   */
  @Transactional()
  async delete(
    contextId: string,
    projectId: string,
    nonAdminMemberIds: ReadonlySet<string>
  ): Promise<void> {
    const entity = await this.getByIdAndProject(contextId, projectId);

    const { counts, nonBlockingMemberIds } = await this.countBlockingAttachments(
      contextId,
      projectId,
      nonAdminMemberIds
    );
    const total =
      counts.dataMartCount +
      counts.storageCount +
      counts.destinationCount +
      counts.memberCount +
      counts.userProvisioningDefaultsCount;

    if (total > 0) {
      throw new ConflictException({
        message:
          'Context is attached to resources, members, or user provisioning defaults. Detach it from all Data Marts, Storages, Destinations, Members and User Provisioning settings before deleting.',
        ...counts,
      });
    }

    // Remove only the assignments the check found non-blocking, so one added
    // in the meantime by a Selected contexts member is not dropped silently.
    if (nonBlockingMemberIds.length > 0) {
      await this.memberRoleContextRepository.delete({
        contextId,
        projectId,
        userId: In(nonBlockingMemberIds),
      });
    }
    await this.contextRepository.softRemove(entity);
  }

  private async countBlockingAttachments(
    contextId: string,
    projectId: string,
    nonAdminMemberIds: ReadonlySet<string>
  ) {
    const [
      dataMartCount,
      storageCount,
      destinationCount,
      memberAssignments,
      userProvisioningDefaultsCount,
    ] = await Promise.all([
      this.dataMartContextRepository.count({ where: { contextId } }),
      this.storageContextRepository.count({ where: { contextId } }),
      this.destinationContextRepository.count({ where: { contextId } }),
      this.splitMemberAssignments(contextId, projectId, nonAdminMemberIds),
      this.userProvisioningContextSettingsContextRepository.count({ where: { contextId } }),
    ]);

    return {
      counts: {
        dataMartCount,
        storageCount,
        destinationCount,
        memberCount: memberAssignments.blockingUserIds.length,
        userProvisioningDefaultsCount,
      },
      nonBlockingMemberIds: memberAssignments.nonBlockingUserIds,
    };
  }

  /**
   * Splits the members assigned to this context by whether the context decides
   * their access. Only a current non-admin member with a stored Selected
   * contexts scope is restricted by it (the same rule as `affectedMemberIds`).
   * A member switched to Entire project keeps their assignments, so they come
   * back if the admin switches the member back; until then they grant nothing.
   * A member with no stored scope gets the user provisioning default on first
   * read, which replaces their assignments, so a leftover one never decides
   * access either. Admins see everything whatever their stored scope (it stays
   * behind when the role changes outside ODM), and people no longer in the
   * project see nothing; neither is shown as assigned in Members.
   */
  private async splitMemberAssignments(
    contextId: string,
    projectId: string,
    nonAdminMemberIds: ReadonlySet<string>
  ): Promise<{ blockingUserIds: string[]; nonBlockingUserIds: string[] }> {
    const assignments = await this.memberRoleContextRepository.find({
      where: { contextId, projectId },
    });
    if (assignments.length === 0) return { blockingUserIds: [], nonBlockingUserIds: [] };

    const userIds = assignments.map(a => a.userId);
    const candidateIds = userIds.filter(id => nonAdminMemberIds.has(id));
    const restrictedScopes =
      candidateIds.length > 0
        ? await this.memberRoleScopeRepository.find({
            where: { projectId, userId: In(candidateIds), roleScope: RoleScope.SELECTED_CONTEXTS },
          })
        : [];
    const restrictedUserIds = new Set(restrictedScopes.map(s => s.userId));

    return {
      blockingUserIds: userIds.filter(id => restrictedUserIds.has(id)),
      nonBlockingUserIds: userIds.filter(id => !restrictedUserIds.has(id)),
    };
  }

  async getByIdAndProject(contextId: string, projectId: string): Promise<Context> {
    const entity = await this.contextRepository.findOne({
      where: { id: contextId, projectId },
    });

    if (!entity) {
      throw new NotFoundException(`Context with id ${contextId} not found in project ${projectId}`);
    }

    return entity;
  }

  async validateContextIds(contextIds: string[], projectId: string): Promise<void> {
    if (contextIds.length === 0) return;

    const count = await this.contextRepository.count({
      where: { id: In(contextIds), projectId },
    });

    if (count !== contextIds.length) {
      throw new BadRequestException(
        'One or more context IDs are invalid or do not belong to this project'
      );
    }
  }

  private async validateUniqueName(
    name: string,
    projectId: string,
    excludeId?: string
  ): Promise<void> {
    const whereCondition: Record<string, unknown> = { name, projectId };
    if (excludeId) {
      whereCondition.id = Not(excludeId);
    }

    const existing = await this.contextRepository.findOne({
      where: whereCondition,
    });

    if (existing) {
      throw new ConflictException(`Context with name "${name}" already exists in this project`);
    }
  }
}
