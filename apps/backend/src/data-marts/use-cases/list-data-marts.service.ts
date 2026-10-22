import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { PaginatedDataMartListItemsDto } from '../dto/domain/paginated-data-mart-list-items.dto';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { Report } from '../entities/report.entity';
import { RoleScope } from '../enums/role-scope.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { countDataMartRelationships } from '../utils/count-data-mart-relationships';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';

export const DATA_MARTS_PAGE_SIZE = 1000;

@Injectable()
export class ListDataMartsService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepo: Repository<DataMartScheduledTrigger>,
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly contextAccessService: ContextAccessService,
    private readonly relationshipService: DataMartRelationshipService
  ) {}

  async run(command: ListDataMartsCommand): Promise<PaginatedDataMartListItemsDto> {
    const offset = command.offset ?? 0;
    const isAdmin = command.roles.includes('admin');
    const roleScope: RoleScope = isAdmin
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    const { items: dataMarts, total } = await this.dataMartService.findByProjectIdForList(
      command.projectId,
      {
        offset,
        limit: DATA_MARTS_PAGE_SIZE,
        ownerFilter: command.ownerFilter,
        userId: command.userId,
        roles: command.roles,
        roleScope,
        ...(command.contextIds?.length ? { contextIds: command.contextIds } : {}),
        ...(command.status ? { status: command.status } : {}),
      }
    );

    if (dataMarts.length === 0) {
      return { items: [], total, offset };
    }

    const ids = dataMarts.map(dataMart => dataMart.id);

    const [rawTriggerCounts, rawReportCounts, relationshipCountMap] = await Promise.all([
      this.triggerRepo
        .createQueryBuilder('t')
        .leftJoin('t.dataMart', 'dm')
        .where('dm.id IN (:...ids)', { ids })
        .select('dm.id', 'dataMartId')
        .addSelect('COUNT(*)', 'count')
        .groupBy('dm.id')
        .getRawMany<{ dataMartId: string; count: string }>(),
      this.reportRepo
        .createQueryBuilder('r')
        .leftJoin('r.dataMart', 'dm')
        .where('dm.id IN (:...ids)', { ids })
        .select('dm.id', 'dataMartId')
        .addSelect('COUNT(*)', 'count')
        .groupBy('dm.id')
        .getRawMany<{ dataMartId: string; count: string }>(),
      command.includeRelationshipsCount
        ? this.countVisibleRelationships(command.projectId, ids, {
            userId: command.userId,
            roles: command.roles,
            roleScope,
          })
        : new Map<string, number>(),
    ]);

    const triggerCountMap = new Map<string, number>(
      rawTriggerCounts.map(r => [r.dataMartId, Number(r.count)])
    );
    const reportCountMap = new Map<string, number>(
      rawReportCounts.map(r => [r.dataMartId, Number(r.count)])
    );

    const userProjections =
      await this.userProjectionsFetcherService.fetchAllRelevantUserProjections(dataMarts);

    const items = dataMarts.map(dm =>
      this.mapper.toListItemDto(
        dm,
        {
          triggersCount: triggerCountMap.get(dm.id) ?? 0,
          reportsCount: reportCountMap.get(dm.id) ?? 0,
          relationshipsCount: relationshipCountMap.get(dm.id) ?? 0,
        },
        userProjections.getByUserId(dm.createdById),
        resolveOwnerUsers(dm.businessOwnerIds, userProjections),
        resolveOwnerUsers(dm.technicalOwnerIds, userProjections)
      )
    );

    return { items, total, offset };
  }

  /**
   * Counts the relationships of the listed Data Marts. As on the Models canvas, a relationship
   * counts only when the caller can see the Data Mart at its other end, so the count does not
   * reveal Data Marts hidden from the caller.
   */
  private async countVisibleRelationships(
    projectId: string,
    ids: string[],
    visibility: { userId: string; roles: string[]; roleScope: RoleScope }
  ): Promise<Map<string, number>> {
    const relationships = await this.relationshipService.findEndpointsByDataMartIds(projectId, ids);
    if (relationships.length === 0) return new Map();

    // Listed Data Marts already passed the visibility check; only the other ends need one.
    const visibleIds = new Set(ids);
    const otherEndIds = relationships
      .flatMap(({ sourceDataMartId, targetDataMartId }) => [sourceDataMartId, targetDataMartId])
      .filter(id => !visibleIds.has(id));
    const visibleOtherEndIds = await this.dataMartService.findVisibleIdsByProjectIdAndIds(
      projectId,
      otherEndIds,
      visibility
    );
    for (const id of visibleOtherEndIds) visibleIds.add(id);

    return countDataMartRelationships(
      relationships.filter(
        ({ sourceDataMartId, targetDataMartId }) =>
          visibleIds.has(sourceDataMartId) && visibleIds.has(targetDataMartId)
      ),
      ids
    );
  }
}
