import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { ListReportsByProjectCommand } from '../dto/domain/list-reports-by-project.command';
import { ReportDto } from '../dto/domain/report.dto';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { ContextAccessService } from '../services/context/context-access.service';
import { buildContextGateSql } from '../utils/build-context-gate-sql';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListReportsByProjectService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: ListReportsByProjectCommand): Promise<ReportDto[]> {
    const isAdmin = command.roles.includes('admin');
    const isTu = command.roles.includes('editor') || isAdmin;
    const roleScope: RoleScope = isAdmin
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    // Get all data reports for the project — filtered by DM visibility
    let qb = this.reportRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.dataMart', 'dataMart')
      .leftJoinAndSelect('dataMart.storage', 'storage')
      .leftJoinAndSelect('r.dataDestination', 'dataDestination')
      .leftJoinAndSelect('r.owners', 'owners')
      .where('dataMart.projectId = :projectId', { projectId: command.projectId })
      .andWhere('dataMart.deletedAt IS NULL');

    // Reports inherit DM visibility: only show reports on visible DataMarts
    if (!isAdmin) {
      const contextGate = buildContextGateSql({
        joinTable: 'data_mart_contexts',
        entityIdColumn: 'data_mart_id',
        entityAlias: 'dataMart',
      });
      const sharedClause = isTu
        ? `(dataMart.availableForReporting = :isTrue OR dataMart.availableForMaintenance = :isTrue)`
        : `dataMart.availableForReporting = :isTrue`;
      qb = qb.andWhere(
        `(
          EXISTS (SELECT 1 FROM data_mart_technical_owners t WHERE t.data_mart_id = dataMart.id AND t.user_id = :userId)
          OR EXISTS (SELECT 1 FROM data_mart_business_owners b WHERE b.data_mart_id = dataMart.id AND b.user_id = :userId)
          OR (
            ${sharedClause}
            AND ${contextGate}
          )
        )`,
        {
          userId: command.userId,
          isTrue: true,
          roleScope,
          entireProjectScope: RoleScope.ENTIRE_PROJECT,
          projectId: command.projectId,
        }
      );
    }

    if (command.ownerFilter === OwnerFilter.HAS_OWNERS) {
      qb = qb.andWhere('EXISTS (SELECT 1 FROM report_owners o WHERE o.report_id = r.id)');
    } else if (command.ownerFilter === OwnerFilter.NO_OWNERS) {
      qb = qb.andWhere('NOT EXISTS (SELECT 1 FROM report_owners o WHERE o.report_id = r.id)');
    }

    const reports = await qb.getMany();

    const allUserIds = reports.flatMap(r => [
      ...(r.createdById ? [r.createdById] : []),
      ...r.ownerIds,
    ]);
    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    return this.mapper.toDomainDtoList(reports, userProjectionsList);
  }
}
