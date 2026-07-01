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
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { ReportAccessService } from '../services/report-access.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { applyDataMartVisibilityFilter } from '../utils/apply-data-mart-visibility-filter';

@Injectable()
export class ListReportsByProjectService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly contextAccessService: ContextAccessService,
    private readonly reportAccessService: ReportAccessService
  ) {}

  async run(command: ListReportsByProjectCommand): Promise<ReportDto[]> {
    const isAdmin = command.roles.includes('admin');
    const roleScope: RoleScope = isAdmin
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    // Select the ordered page without joining wide report relations or one-to-many owners.
    let pageQb = this.reportRepository
      .createQueryBuilder('r')
      .innerJoin('r.dataMart', 'dataMart')
      .where('dataMart.projectId = :projectId', { projectId: command.projectId })
      .andWhere('dataMart.deletedAt IS NULL');

    applyDataMartVisibilityFilter(pageQb, {
      dataMartAlias: 'dataMart',
      projectId: command.projectId,
      userId: command.userId,
      roles: command.roles,
      roleScope,
    });

    if (command.ownerFilter === OwnerFilter.HAS_OWNERS) {
      pageQb = pageQb.andWhere('EXISTS (SELECT 1 FROM report_owners o WHERE o.report_id = r.id)');
    } else if (command.ownerFilter === OwnerFilter.NO_OWNERS) {
      pageQb = pageQb.andWhere(
        'NOT EXISTS (SELECT 1 FROM report_owners o WHERE o.report_id = r.id)'
      );
    }

    pageQb = pageQb.select('r.id', 'id').orderBy('r.createdAt', 'DESC').addOrderBy('r.id', 'DESC');

    if (command.limit !== undefined) {
      pageQb = pageQb.limit(command.limit);
    }

    if (command.offset !== undefined) {
      pageQb = pageQb.offset(command.offset);
    }

    const page = await pageQb.getRawMany<{ id: string }>();
    const reportIds = page.map(({ id }) => id);
    if (reportIds.length === 0) {
      return [];
    }

    const reports = await this.reportRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.dataMart', 'dataMart')
      .leftJoinAndSelect('dataMart.storage', 'storage')
      .leftJoinAndSelect('r.dataDestination', 'dataDestination')
      .leftJoinAndSelect('r.owners', 'owners')
      .where('r.id IN (:...reportIds)', { reportIds })
      .getMany();
    const reportsById = new Map(reports.map(report => [report.id, report]));
    const orderedReports = reportIds.flatMap(id => {
      const report = reportsById.get(id);
      return report ? [report] : [];
    });

    const allUserIds = orderedReports.flatMap(r => [
      ...(r.createdById ? [r.createdById] : []),
      ...r.ownerIds,
    ]);
    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    const reportsWithCaps = await Promise.all(
      orderedReports.map(async report => {
        const capabilities = await this.reportAccessService.computeCapabilitiesForReport(
          command.userId,
          command.roles,
          report,
          command.projectId
        );

        return this.mapper.toDomainDto(
          report,
          report.createdById
            ? (userProjectionsList?.getByUserId(report.createdById) ?? null)
            : null,
          userProjectionsList ? resolveOwnerUsers(report.ownerIds, userProjectionsList) : [],
          capabilities
        );
      })
    );

    return reportsWithCaps;
  }
}
