import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { ReportDto } from '../dto/domain/report.dto';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class ListReportsByDataMartService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: ListReportsByDataMartCommand): Promise<ReportDto[]> {
    // Check if user can SEE the parent DataMart
    const canSeeDm = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      command.dataMartId,
      Action.SEE,
      command.projectId
    );
    if (!canSeeDm) {
      return [];
    }

    // Find all reports for the data mart
    const reports = await this.reportRepository.find({
      where: {
        dataMart: {
          id: command.dataMartId,
        },
      },
      relations: ['dataMart', 'dataDestination', 'owners'],
    });

    const allUserIds = reports.flatMap(r => [
      ...(r.createdById ? [r.createdById] : []),
      ...r.ownerIds,
    ]);
    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    return this.mapper.toDomainDtoList(reports, userProjectionsList);
  }
}
