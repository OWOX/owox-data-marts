import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { CredentialContext } from '../../credentials/entities/credential-context.entity';
import {
  contextRevision,
  lockContextReferences,
  contextCurrentReadLock,
} from './context-reference-guard';
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

  @Transactional()
  async create(
    projectId: string,
    createdById: string,
    name: string,
    description?: string
  ): Promise<ContextDto> {
    await this.lockReferences(projectId);
    await this.validateUniqueName(name, projectId);

    const entity = this.contextRepository.create({
      name,
      description,
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

    return this.contextMapper.toDomainDto(
      saved,
      userProjections,
      await this.getRevision(projectId)
    );
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
    const revision = await this.getRevision(projectId);
    const entities = await this.contextRepository.find({
      where: { projectId },
      order: { name: 'ASC' },
    });

    const creatorIds = entities
      .map(e => e.createdById)
      .filter((id): id is string => typeof id === 'string');
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(creatorIds);

    return entities.map(entity =>
      this.contextMapper.toDomainDto(entity, userProjections, revision)
    );
  }

  @Transactional()
  async update(
    contextId: string,
    projectId: string,
    name: string,
    description?: string | null,
    expectedRevision?: number
  ): Promise<ContextDto> {
    await this.lockReferences(projectId, expectedRevision);
    const entity = await this.getByIdAndProject(contextId, projectId);

    await this.validateUniqueName(name, projectId, contextId);

    entity.name = name;
    entity.description = description;

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

    return this.contextMapper.toDomainDto(
      saved,
      userProjections,
      await this.getRevision(projectId)
    );
  }

  async getImpact(contextId: string, projectId: string): Promise<ContextImpactDto> {
    const entity = await this.getByIdAndProject(contextId, projectId);

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
      this.memberRoleContextRepository.count({ where: { contextId } }),
      this.userProvisioningContextSettingsContextRepository.count({ where: { contextId } }),
    ]);

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
   */
  @Transactional()
  async delete(contextId: string, projectId: string): Promise<void> {
    await this.lockReferences(projectId);
    const credentialCount = await this.contextRepository.manager
      .getRepository(CredentialContext)
      .countBy({ contextId });
    if (credentialCount)
      throw new ConflictException({
        message: 'Detach Credentials before deleting this Context',
        credentialCount,
      });
    const entity = await this.getByIdAndProject(contextId, projectId);

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
      this.memberRoleContextRepository.count({ where: { contextId } }),
      this.userProvisioningContextSettingsContextRepository.count({ where: { contextId } }),
    ]);

    if (
      dataMartCount +
        storageCount +
        destinationCount +
        memberCount +
        userProvisioningDefaultsCount >
      0
    ) {
      throw new ConflictException({
        message:
          'Context is attached to resources, members, or user provisioning defaults. Detach it from all Data Marts, Storages, Destinations, Members and User Provisioning settings before deleting.',
        dataMartCount,
        storageCount,
        destinationCount,
        memberCount,
        userProvisioningDefaultsCount,
      });
    }

    await this.contextRepository.softRemove(entity);
  }

  async getCredentialReferenceCount(contextId: string): Promise<number> {
    return this.contextRepository.manager.getRepository(CredentialContext).countBy({ contextId });
  }

  async lockReferences(projectId: string, expectedRevision?: number): Promise<number> {
    return lockContextReferences(this.contextRepository.manager, projectId, expectedRevision);
  }

  async getRevision(projectId: string): Promise<number> {
    return contextRevision(this.contextRepository.manager, projectId);
  }

  async getByIdAndProject(contextId: string, projectId: string): Promise<Context> {
    const entity = await this.contextRepository.findOne({
      where: { id: contextId, projectId },
      lock: contextCurrentReadLock(this.contextRepository.manager),
    });

    if (!entity) {
      throw new NotFoundException(`Context with id ${contextId} not found in project ${projectId}`);
    }

    return entity;
  }

  async validateContextIds(contextIds: string[], projectId: string): Promise<void> {
    if (contextIds.length === 0) return;

    const lock = contextCurrentReadLock(this.contextRepository.manager);
    let count: number;
    if (lock) {
      const query = this.contextRepository
        .createQueryBuilder('context')
        .select(['context.id'])
        .where({ id: In(contextIds), projectId })
        .setLock(lock.mode);
      count = (await query.getMany()).length;
    } else {
      count = await this.contextRepository.count({ where: { id: In(contextIds), projectId } });
    }

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
      lock: contextCurrentReadLock(this.contextRepository.manager),
    });

    if (existing) {
      throw new ConflictException(`Context with name "${name}" already exists in this project`);
    }
  }
}
