import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { PaginatedDataMartListItemsDto } from '../dto/domain/paginated-data-mart-list-items.dto';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { Report } from '../entities/report.entity';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ContextAccessService } from '../services/context/context-access.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';

const DATA_MARTS_PAGE_SIZE = 1000;

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
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: ListDataMartsCommand): Promise<PaginatedDataMartListItemsDto> {
    const offset = command.offset ?? 0;
    const isAdmin = command.roles.includes('admin');
    const roleScope = isAdmin
      ? 'entire_project'
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
      }
    );

    if (dataMarts.length === 0) {
      return { items: [], total, offset };
    }

    const ids = dataMarts.map(dataMart => dataMart.id);

    const rawTriggerCounts = await this.triggerRepo
      .createQueryBuilder('t')
      .leftJoin('t.dataMart', 'dm')
      .where('dm.id IN (:...ids)', { ids })
      .select('dm.id', 'dataMartId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dm.id')
      .getRawMany<{ dataMartId: string; count: string }>();

    const triggerCountMap = new Map<string, number>(
      rawTriggerCounts.map(r => [r.dataMartId, Number(r.count)])
    );

    const rawReportCounts = await this.reportRepo
      .createQueryBuilder('r')
      .leftJoin('r.dataMart', 'dm')
      .where('dm.id IN (:...ids)', { ids })
      .select('dm.id', 'dataMartId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dm.id')
      .getRawMany<{ dataMartId: string; count: string }>();

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
        },
        userProjections.getByUserId(dm.createdById),
        resolveOwnerUsers(dm.businessOwnerIds, userProjections),
        resolveOwnerUsers(dm.technicalOwnerIds, userProjections)
      )
    );

    return { items, total, offset };
  }
}
