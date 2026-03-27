import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { ReportDto } from '../dto/domain/report.dto';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListReportsByDataMartService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: ListReportsByDataMartCommand): Promise<ReportDto[]> {
    // Find all reports for the data mart
    const reports = await this.reportRepository.find({
      where: {
        dataMart: {
          id: command.dataMartId,
        },
      },
      relations: ['dataMart', 'dataDestination'],
    });

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(reports);

    return this.mapper.toDomainDtoList(reports, userProjectionsList);
  }
}
