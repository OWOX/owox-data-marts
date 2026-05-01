import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { DataDestinationService } from '../services/data-destination.service';

export interface DataDestinationImpact {
  destinationId: string;
  destinationTitle: string;
  reportsCount: number;
  dataMartCount: number;
}

@Injectable()
export class GetDataDestinationImpactService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly dataDestinationService: DataDestinationService
  ) {}

  async run(destinationId: string, projectId: string): Promise<DataDestinationImpact> {
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      destinationId,
      projectId
    );

    // Reports reference both a destination and (via report.dataMart) a data mart;
    // the popup wants the totals separately so admins can see whether one data
    // mart owns all the reports or it spans many.
    const rows = await this.reportRepository
      .createQueryBuilder('report')
      .innerJoin('report.dataMart', 'dataMart')
      .select('COUNT(report.id)', 'reportsCount')
      .addSelect('COUNT(DISTINCT dataMart.id)', 'dataMartCount')
      .where('report.dataDestinationId = :destinationId', { destinationId: destination.id })
      .getRawOne<{ reportsCount: string | number; dataMartCount: string | number }>();

    return {
      destinationId: destination.id,
      destinationTitle: destination.title,
      reportsCount: Number(rows?.reportsCount ?? 0),
      dataMartCount: Number(rows?.dataMartCount ?? 0),
    };
  }
}
