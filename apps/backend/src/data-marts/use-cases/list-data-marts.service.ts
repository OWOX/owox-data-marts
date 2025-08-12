import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { Report } from '../entities/report.entity';

@Injectable()
export class ListDataMartsService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,
    private readonly mapper: DataMartMapper,
    @InjectRepository(DataMartScheduledTrigger)
    private readonly triggerRepo: Repository<DataMartScheduledTrigger>,
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>
  ) {}

  async run(command: ListDataMartsCommand): Promise<DataMartDto[]> {
    const dataMarts = await this.dataMartRepo.find({
      where: { projectId: command.projectId, createdById: command.userId },
    });

    if (dataMarts.length === 0) {
      return [];
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

    return dataMarts.map(dm =>
      this.mapper.toDomainDto(dm, {
        triggersCount: triggerCountMap.get(dm.id) ?? 0,
        reportsCount: reportCountMap.get(dm.id) ?? 0,
      })
    );
  }
}
