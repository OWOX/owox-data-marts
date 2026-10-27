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
import { UserProvisioningContextSettings } from '../../entities/user-provisioning-context-settings.entity';
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
    @InjectRepository(UserProvisioningContextSettings)
    private readonly userProvisioningContextSettingsRepository: Repository<UserProvisioningContextSettings>,
    private readonly contextMapper: ContextMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async create(
    projectId: string,
    createdById: string,
    name: string,
    description?: string,
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

  async listForMcp(projectId: string) {
    const entities = await this.contextRepository.find({
      where: { projectId },
      order: { name: 'ASC' },
    });
    return entities.map(entity => this.contextMapper.toMcpContext(entity));
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
    name: string,
    description?: string,
    icon?: DataMartIconValue | null
  ): Promise<ContextDto> {
    const entity = await this.getByIdAndProject(contextId, projectId);

    await this.validateUniqueName(name, projectId, contextId);

    entity.name = name;
    entity.description = description;
    if (icon !== undefined) {
      entity.icon = icon;
    }

    let saved: Context;
    try {
      saved = await this.contextRepository.save(entity);
    } catch (err) {
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

  /** Sets or resets (null) the icon only; the name, description and links stay as they are. */
  async updateIcon(
    contextId: string,
    projectId: string,
    icon: DataMartIconValue | null
  ): Promise<ContextDto> {
    const entity = await this.getByIdAndProject(contextId, projectId);
    entity.icon = icon;
    const saved = await this.contextRepository.save(entity);

    const userProjections = await this.userProjectionsFetcherService.fetchUserProjectionsList(
      saved.createdById ? [saved.createdById] : []
    );

    return this.contextMapper.toDomainDto(saved, userProjections);
  }

  async getImpact(contextId: string, projectId: string): Promise<ContextImpactDto> {
    const entity = await this.getByIdAndProject(contextId, projectId);

    const {
      dataMartCount,
      storageCount,
      destinationCount,
      memberCount,
      userProvisioningDefaultsCount,
    } = await this.countBlockingAttachments(contextId, projectId);

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

    const affectedMemberIds = affectedMembers.map(m => m.userId);

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
   * Assignments kept by Entire project members are not role assignments in
   * that sense: they grant nothing and the admin cannot see them, so they do
   * not block. They are removed with the context, so a member switched back
   * to Selected contexts later does not carry a deleted context.
   */
  @Transactional()
  async delete(contextId: string, projectId: string): Promise<void> {
    const entity = await this.getByIdAndProject(contextId, projectId);

    const counts = await this.countBlockingAttachments(contextId, projectId);
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

    // Only Entire project members can still hold this context here.
    await this.memberRoleContextRepository.delete({ contextId, projectId });
    await this.contextRepository.softRemove(entity);
  }

  private async countBlockingAttachments(contextId: string, projectId: string) {
    const [
      dataMartCount,
      storageCount,
      destinationCount,
      memberCount,
      userProvisioningDefaultsCount,
    ] = await Promise.all([
      this.dataMartContextRepository.count({ where: { contextId } }),
      this.storageContextRepository.count({ where: { contextId } }),
      this.destinationContextRepository.count({ where: { contextId } }),
      this.countMembersRestrictedByContext(contextId, projectId),
      this.userProvisioningContextSettingsContextRepository.count({ where: { contextId } }),
    ]);

    return {
      dataMartCount,
      storageCount,
      destinationCount,
      memberCount,
      userProvisioningDefaultsCount,
    };
  }

  /**
   * Members whose access this context still decides: those the Members page
   * shows with Selected contexts scope. Switching a member to Entire project
   * keeps their context assignments, so they come back if the admin switches
   * the member back; until then they grant nothing.
   */
  private async countMembersRestrictedByContext(
    contextId: string,
    projectId: string
  ): Promise<number> {
    const assignments = await this.memberRoleContextRepository.find({
      where: { contextId, projectId },
    });
    if (assignments.length === 0) return 0;

    const [storedScopes, provisioningSettings] = await Promise.all([
      this.memberRoleScopeRepository.find({
        where: { projectId, userId: In(assignments.map(a => a.userId)) },
      }),
      this.userProvisioningContextSettingsRepository.findOne({ where: { projectId } }),
    ]);
    // Same fallback as ContextAccessService.getRoleScope: a member with no
    // stored scope gets the project's user provisioning default.
    const defaultScope = provisioningSettings?.roleScope ?? RoleScope.ENTIRE_PROJECT;
    const scopeByUserId = new Map(storedScopes.map(s => [s.userId, s.roleScope]));

    return assignments.filter(
      a => (scopeByUserId.get(a.userId) ?? defaultScope) !== RoleScope.ENTIRE_PROJECT
    ).length;
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
