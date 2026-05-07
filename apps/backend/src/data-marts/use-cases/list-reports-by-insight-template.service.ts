import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { ReportDto } from '../dto/domain/report.dto';
import { ListReportsByInsightTemplateCommand } from '../dto/domain/list-reports-by-insight-template.command';
import { EmailConfigType } from '../data-destination-types/ee/email/schemas/email-config.schema';
import { TemplateSourceTypeEnum } from '../enums/template-source-type.enum';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { ReportAccessService } from '../services/report-access.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';

@Injectable()
export class ListReportsByInsightTemplateService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly reportAccessService: ReportAccessService
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

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(reports);

    return Promise.all(
      reports.map(async report => {
        const [canOperate, canMutate] = command.userId
          ? await Promise.all([
              this.reportAccessService.canOperate(
                command.userId,
                command.roles,
                report.id,
                command.projectId
              ),
              this.reportAccessService.canMutate(
                command.userId,
                command.roles,
                report.id,
                command.projectId
              ),
            ])
          : [false, false];

        return this.mapper.toDomainDto(
          report,
          report.createdById ? (userProjectionsList.getByUserId(report.createdById) ?? null) : null,
          resolveOwnerUsers(report.ownerIds, userProjectionsList),
          {
            canRun: canOperate,
            canManageTriggers: canOperate,
            canEditConfig: canMutate,
          }
        );
      })
    );
  }
}
