import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { ContextAccessService } from '../services/context/context-access.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';

@Injectable()
export class ListDataStoragesService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepo: Repository<DataStorage>,
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,
    private readonly mapper: DataStorageMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: ListDataStoragesCommand): Promise<DataStorageDto[]> {
    const isAdmin = command.roles.includes('admin');
    const isTu = command.roles.includes('editor') || isAdmin;
    const roleScope = isAdmin
      ? 'entire_project'
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    let qb = this.dataStorageRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.owners', 'owners')
      .leftJoinAndSelect('s.contexts', 'sContexts')
      .leftJoinAndSelect('sContexts.context', 'sContext')
      .where('s.projectId = :projectId', { projectId: command.projectId })
      .andWhere('s.deletedAt IS NULL');

    if (!isAdmin) {
      if (isTu) {
        // TU: own OR (shared access with context gate)
        qb = qb.andWhere(
          `(
            EXISTS (SELECT 1 FROM storage_owners o WHERE o.storage_id = s.id AND o.user_id = :userId)
            OR (
              (s.availableForUse = :isTrue OR s.availableForMaintenance = :isTrue)
              AND (
                :roleScope = 'entire_project'
                OR EXISTS (
                  SELECT 1 FROM storage_contexts sc
                  JOIN member_role_contexts mrc ON mrc.context_id = sc.context_id
                  WHERE sc.storage_id = s.id
                  AND mrc.user_id = :userId AND mrc.project_id = :projectId
                )
              )
            )
          )`,
          { userId: command.userId, isTrue: true, roleScope, projectId: command.projectId }
        );
      } else {
        // BU: only own (but BU ownership on Storage has no effect, so effectively none)
        qb = qb.andWhere(
          'EXISTS (SELECT 1 FROM storage_owners o WHERE o.storage_id = s.id AND o.user_id = :userId)',
          { userId: command.userId }
        );
      }
    }

    if (command.ownerFilter === OwnerFilter.HAS_OWNERS) {
      qb = qb.andWhere('EXISTS (SELECT 1 FROM storage_owners o WHERE o.storage_id = s.id)');
    } else if (command.ownerFilter === OwnerFilter.NO_OWNERS) {
      qb = qb.andWhere('NOT EXISTS (SELECT 1 FROM storage_owners o WHERE o.storage_id = s.id)');
    }

    const dataStorages = await qb.getMany();

    if (dataStorages.length === 0) {
      return [];
    }

    const ids = dataStorages.map(s => s.id);

    const rawCounts = await this.dataMartRepo
      .createQueryBuilder('dm')
      .leftJoin('dm.storage', 's')
      .where('s.id IN (:...ids)', { ids })
      .andWhere('dm.projectId = :projectId', { projectId: command.projectId })
      .andWhere('dm.deletedAt IS NULL')
      .select('s.id', 'storageId')
      .addSelect(
        'COUNT(DISTINCT CASE WHEN dm.status = :publishedStatus THEN dm.id END)',
        'publishedCount'
      )
      .addSelect('COUNT(DISTINCT CASE WHEN dm.status = :draftStatus THEN dm.id END)', 'draftsCount')
      .setParameters({
        publishedStatus: DataMartStatus.PUBLISHED,
        draftStatus: DataMartStatus.DRAFT,
      })
      .groupBy('s.id')
      .getRawMany<{ storageId: string; publishedCount: string; draftsCount: string }>();

    const countMap = new Map(
      rawCounts.map(r => [
        r.storageId,
        { published: Number(r.publishedCount), drafts: Number(r.draftsCount) },
      ])
    );

    const allUserIds = dataStorages.flatMap(s => [
      ...(s.createdById ? [s.createdById] : []),
      ...s.ownerIds,
    ]);
    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    return dataStorages.map(s => {
      const counts = countMap.get(s.id);
      return this.mapper.toDomainDto(
        s,
        counts?.published ?? 0,
        counts?.drafts ?? 0,
        s.createdById ? (userProjectionsList?.getByUserId(s.createdById) ?? null) : null,
        resolveOwnerUsers(s.ownerIds, userProjectionsList)
      );
    });
  }
}
