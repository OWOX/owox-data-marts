import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { PaginatedDataMartListDto } from '../dto/domain/paginated-data-mart-list.dto';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { Report } from '../entities/report.entity';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

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
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: ListDataMartsCommand): Promise<PaginatedDataMartListDto> {
    const offset = command.offset ?? 0;

    const { items: dataMarts, total } = await this.dataMartService.findByProjectId(
      command.projectId,
      { offset, limit: DATA_MARTS_PAGE_SIZE }
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
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(dataMarts);

    const items = dataMarts.map(dm =>
      this.mapper.toDomainDto(
        dm,
        {
          triggersCount: triggerCountMap.get(dm.id) ?? 0,
          reportsCount: reportCountMap.get(dm.id) ?? 0,
        },
        userProjections.getByUserId(dm.createdById)
      )
    );

    return { items, total, offset };
  }
}
