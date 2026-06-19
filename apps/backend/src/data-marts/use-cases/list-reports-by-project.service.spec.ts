import { ListReportsByProjectCommand } from '../dto/domain/list-reports-by-project.command';
import { RoleScope } from '../enums/role-scope.enum';
import { ListReportsByProjectService } from './list-reports-by-project.service';

describe('ListReportsByProjectService', () => {
  function createQueryBuilder() {
    return {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
      getMany: jest.fn(),
    };
  }

  function createService(reports = [buildReport()]) {
    const qb = createQueryBuilder();
    qb.getRawMany.mockResolvedValue(reports.map(report => ({ id: report.id })));
    const rowsQb = createQueryBuilder();
    rowsQb.getMany.mockResolvedValue(reports);
    const reportRepository = {
      createQueryBuilder: jest.fn().mockReturnValueOnce(qb).mockReturnValueOnce(rowsQb),
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
      rowsQb,
      contextAccessService,
      reportAccessService,
      mapper,
    };
  }

  it('applies pagination while keeping DB-side Data Mart visibility filtering', async () => {
    const { service, qb, contextAccessService, reportAccessService } = createService();

    await service.run(
      new ListReportsByProjectCommand('project-1', 'user-1', ['viewer'], undefined, 25, 50)
    );

    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(qb.select).toHaveBeenCalledWith('r.id', 'id');
    expect(qb.limit).toHaveBeenCalledWith(25);
    expect(qb.offset).toHaveBeenCalledWith(50);
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
    expect(qb.limit).toHaveBeenCalledWith(10);
    expect(qb.offset).toHaveBeenCalledWith(0);
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('data_mart_contexts'),
      expect.anything()
    );
  });

  it('does not constrain the legacy project list when pagination is omitted', async () => {
    const { service, qb } = createService();

    await service.run(new ListReportsByProjectCommand('project-1', 'user-1', ['viewer']));

    expect(qb.limit).not.toHaveBeenCalled();
    expect(qb.offset).not.toHaveBeenCalled();
  });

  it('loads wide report relations without SQL ordering and restores page order', async () => {
    const first = buildReport({ id: 'report-1' });
    const second = buildReport({ id: 'report-2' });
    const { service, qb, rowsQb, mapper } = createService([second, first]);
    qb.getRawMany.mockResolvedValue([{ id: 'report-1' }, { id: 'report-2' }]);

    await service.run(
      new ListReportsByProjectCommand('project-1', 'admin-1', ['admin'], undefined, 20, 0)
    );

    expect(rowsQb.where).toHaveBeenCalledWith('r.id IN (:...reportIds)', {
      reportIds: ['report-1', 'report-2'],
    });
    expect(rowsQb.orderBy).not.toHaveBeenCalled();
    expect(mapper.toDomainDto.mock.calls.map(call => call[0].id)).toEqual(['report-1', 'report-2']);
  });
});

function buildReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    createdById: 'creator-1',
    ownerIds: ['owner-1'],
    dataMart: {
      id: 'dm-1',
      projectId: 'project-1',
    },
    ...overrides,
  };
}
