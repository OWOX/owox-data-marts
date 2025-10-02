import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { ReportDto } from '../dto/domain/report.dto';

@Injectable()
export class ListReportsByDataMartService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper
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

    return this.mapper.toDomainDtoList(reports);
  }
}
