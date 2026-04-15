import { Repository } from 'typeorm';
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { GetReportCommand } from '../dto/domain/get-report.command';
import { ReportDto } from '../dto/domain/report.dto';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class GetReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetReportCommand): Promise<ReportDto> {
    const report = await this.reportRepository.findOne({
      where: {
        id: command.id,
        dataMart: {
          projectId: command.projectId,
        },
      },
      relations: ['dataMart', 'dataDestination', 'owners'],
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${command.id} not found`);
    }

    if (command.userId) {
      const canSee = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        report.dataMart.id,
        Action.SEE,
        command.projectId
      );
      if (!canSee) {
        throw new ForbiddenException('You do not have access to the DataMart for this report');
      }
    }

    const allUserIds = [...(report.createdById ? [report.createdById] : []), ...report.ownerIds];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    const createdByUser = userProjections.getByUserId(report.createdById) ?? null;

    return this.mapper.toDomainDto(
      report,
      createdByUser,
      resolveOwnerUsers(report.ownerIds, userProjections)
    );
  }
}
