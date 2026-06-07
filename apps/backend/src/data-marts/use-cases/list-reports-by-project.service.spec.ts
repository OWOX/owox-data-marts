import { ListReportsByProjectCommand } from '../dto/domain/list-reports-by-project.command';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { ListReportsByProjectService } from './list-reports-by-project.service';

describe('ListReportsByProjectService', () => {
  function createQueryBuilder(reports: unknown[]) {
    return {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(reports),
    };
  }

  function createService(reports = [buildReport()]) {
    const qb = createQueryBuilder(reports);
    const reportRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const mapper = {
      toDomainDto: jest.fn(report => ({ id: report.id })),
    };
    const userProjectionsList = {
      getByUserId: jest.fn(userId => ({ id: userId, fullName: userId })),
    };
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue(userProjectionsList),
    };
    const contextAccessService = {
      getRoleScope: jest.fn().mockResolvedValue(RoleScope.SELECTED_CONTEXTS),
    };
    const reportAccessService = {
      computeCapabilitiesForReport: jest.fn().mockResolvedValue({
        canRun: true,
        canManageTriggers: true,
        canEditConfig: false,
      }),
    };

    const service = new ListReportsByProjectService(
      reportRepository as never,
      mapper as never,
      userProjectionsFetcherService as never,
      contextAccessService as never,
      reportAccessService as never
    );

    return {
      service,
      qb,
      contextAccessService,
      reportAccessService,
      mapper,
    };
  }

  it('applies pagination while keeping DB-side Data Mart visibility filtering', async () => {
    const { service, qb, contextAccessService, reportAccessService } = createService();

    await service.run(
      new ListReportsByProjectCommand('project-1', 'user-1', ['viewer'], OwnerFilter.ALL, 25, 50)
    );

    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(qb.take).toHaveBeenCalledWith(25);
    expect(qb.skip).toHaveBeenCalledWith(50);
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('data_mart_contexts'), {
      userId: 'user-1',
      isTrue: true,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      entireProjectScope: RoleScope.ENTIRE_PROJECT,
      projectId: 'project-1',
    });
    expect(reportAccessService.computeCapabilitiesForReport).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      expect.objectContaining({ id: 'report-1' }),
      'project-1'
    );
  });

  it('does not add per-user visibility predicates for admins', async () => {
    const { service, qb, contextAccessService } = createService();

    await service.run(
      new ListReportsByProjectCommand('project-1', 'admin-1', ['admin'], undefined, 10, 0)
    );

    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('data_mart_contexts'),
      expect.anything()
    );
  });

  it('does not constrain the legacy project list when pagination is omitted', async () => {
    const { service, qb } = createService();

    await service.run(new ListReportsByProjectCommand('project-1', 'user-1', ['viewer']));

    expect(qb.take).not.toHaveBeenCalled();
    expect(qb.skip).not.toHaveBeenCalled();
  });
});

function buildReport() {
  return {
    id: 'report-1',
    createdById: 'creator-1',
    ownerIds: ['owner-1'],
    dataMart: {
      id: 'dm-1',
      projectId: 'project-1',
    },
  };
}
