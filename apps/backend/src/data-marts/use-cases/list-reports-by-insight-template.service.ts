import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { ReportDto } from '../dto/domain/report.dto';
import { ListReportsByInsightTemplateCommand } from '../dto/domain/list-reports-by-insight-template.command';
import { EmailConfigType } from '../data-destination-types/ee/email/schemas/email-config.schema';
import { TemplateSourceTypeEnum } from '../enums/template-source-type.enum';

@Injectable()
export class ListReportsByInsightTemplateService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper
  ) {}

  async run(command: ListReportsByInsightTemplateCommand): Promise<ReportDto[]> {
    const reports = await this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.dataMart', 'dataMart')
      .leftJoinAndSelect('dataMart.storage', 'storage')
      .leftJoinAndSelect('report.dataDestination', 'dataDestination')
      .where('dataMart.id = :dataMartId', { dataMartId: command.dataMartId })
      .andWhere('dataMart.projectId = :projectId', { projectId: command.projectId })
      .andWhere(`JSON_EXTRACT(report.destinationConfig, '$.type') = :type`, {
        type: EmailConfigType,
      })
      .andWhere(`JSON_EXTRACT(report.destinationConfig, '$.templateSource.type') = :sourceType`, {
        sourceType: TemplateSourceTypeEnum.INSIGHT_TEMPLATE,
      })
      .andWhere(
        `JSON_EXTRACT(report.destinationConfig, '$.templateSource.config.insightTemplateId') = :insightTemplateId`,
        {
          insightTemplateId: command.insightTemplateId,
        }
      )
      .getMany();

    return this.mapper.toDomainDtoList(reports);
  }
}
