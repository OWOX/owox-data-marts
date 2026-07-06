jest.mock('snowflake-sdk', () => ({
  createConnection: jest.fn(),
}));

import type { Repository } from 'typeorm';
import type { DataMart } from '../entities/data-mart.entity';
import type { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import type { Report } from '../entities/report.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { McpDataCatalogSummaryRepository } from './mcp-data-catalog-summary.repository';

describe('McpDataCatalogSummaryRepository', () => {
  const createQueryBuilder = (rawRows: unknown[] = []) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  });

  const createRepository = () => {
    const dataMartQb = createQueryBuilder([
      {
        id: 'dm-1',
        title: 'Orders',
        description: 'Orders mart',
        modifiedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ]);
    const triggerQb = createQueryBuilder([{ dataMartId: 'dm-1', count: '2' }]);
    const reportQb = createQueryBuilder([{ dataMartId: 'dm-1', count: '3' }]);
    const dataMartRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(dataMartQb),
    } as unknown as jest.Mocked<Repository<DataMart>>;
    const triggerRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(triggerQb),
    } as unknown as jest.Mocked<Repository<DataMartScheduledTrigger>>;
    const reportRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(reportQb),
    } as unknown as jest.Mocked<Repository<Report>>;

    return {
      repository: new McpDataCatalogSummaryRepository(
        dataMartRepository,
        triggerRepository,
        reportRepository
      ),
      dataMartQb,
      triggerQb,
      reportQb,
      triggerRepository,
      reportRepository,
    };
  };

  it('loads published visible data marts as compact rows without pagination', async () => {
    const { repository, dataMartQb } = createRepository();

    const result = await repository.listPublishedVisibleDataMartRows({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
    });

    expect(dataMartQb.where).toHaveBeenCalledWith('dm.projectId = :projectId', {
      projectId: 'project-1',
    });
    expect(dataMartQb.andWhere).toHaveBeenCalledWith('dm.status = :status', {
      status: DataMartStatus.PUBLISHED,
    });
    expect(dataMartQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('data_mart_contexts'),
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        roleScope: RoleScope.SELECTED_CONTEXTS,
      })
    );
    expect(dataMartQb.take).not.toHaveBeenCalled();
    expect(dataMartQb.skip).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'dm-1',
        title: 'Orders',
        description: 'Orders mart',
        modifiedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ]);
  });

  it('counts triggers and reports by data mart ids', async () => {
    const { repository, triggerQb, reportQb } = createRepository();

    await expect(repository.countTriggersByDataMartIds(['dm-1'])).resolves.toEqual(
      new Map([['dm-1', 2]])
    );
    expect(triggerQb.where).toHaveBeenCalledWith('dm.id IN (:...ids)', { ids: ['dm-1'] });
    expect(triggerQb.groupBy).toHaveBeenCalledWith('dm.id');

    await expect(repository.countReportsByDataMartIds(['dm-1'])).resolves.toEqual(
      new Map([['dm-1', 3]])
    );
    expect(reportQb.where).toHaveBeenCalledWith('dm.id IN (:...ids)', { ids: ['dm-1'] });
    expect(reportQb.groupBy).toHaveBeenCalledWith('dm.id');
  });

  it('does not query counters when ids are empty', async () => {
    const { repository, triggerRepository, reportRepository } = createRepository();

    await expect(repository.countTriggersByDataMartIds([])).resolves.toEqual(new Map());
    await expect(repository.countReportsByDataMartIds([])).resolves.toEqual(new Map());

    expect(triggerRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(reportRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
