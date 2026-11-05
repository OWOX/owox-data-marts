import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetDataDestinationImpactCommand } from '../dto/domain/get-data-destination-impact.command';
import { Action, EntityType } from '../services/access-decision';
import { GetDataDestinationImpactService } from './get-data-destination-impact.service';

describe('GetDataDestinationImpactService', () => {
  const command = new GetDataDestinationImpactCommand('destination', 'project', 'user', ['editor']);

  function create() {
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ reportsCount: '3', dataMartCount: '2' }),
    };
    const reports = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const destinations = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({
        id: 'destination',
        title: 'Finance reports',
      }),
    };
    const access = { canAccess: jest.fn().mockResolvedValue(true) };
    const service = new GetDataDestinationImpactService(
      reports as never,
      destinations as never,
      access as never
    );
    return { service, query, reports, destinations, access };
  }

  it('counts reports and distinct Data Marts for the project-scoped Destination', async () => {
    const { service, query, destinations, access } = create();

    await expect(service.run(command)).resolves.toEqual({
      destinationId: 'destination',
      destinationTitle: 'Finance reports',
      reportsCount: 3,
      dataMartCount: 2,
    });
    expect(destinations.getByIdAndProjectId).toHaveBeenCalledWith('destination', 'project');
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DESTINATION,
      'destination',
      Action.DELETE,
      'project'
    );
    expect(query.innerJoin).toHaveBeenCalledWith('report.dataMart', 'dataMart');
    expect(query.select).toHaveBeenCalledWith('COUNT(report.id)', 'reportsCount');
    expect(query.addSelect).toHaveBeenCalledWith('COUNT(DISTINCT dataMart.id)', 'dataMartCount');
    expect(query.where).toHaveBeenCalledWith('report.dataDestinationId = :destinationId', {
      destinationId: 'destination',
    });
  });

  it('requires DELETE access before querying reports', async () => {
    const { service, reports, access } = create();
    access.canAccess.mockResolvedValue(false);

    await expect(service.run(command)).rejects.toBeInstanceOf(ForbiddenException);
    expect(reports.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('does not query impact for a Destination outside the current project', async () => {
    const { service, reports, destinations, access } = create();
    destinations.getByIdAndProjectId.mockRejectedValue(new NotFoundException());

    await expect(service.run(command)).rejects.toBeInstanceOf(NotFoundException);
    expect(destinations.getByIdAndProjectId).toHaveBeenCalledWith('destination', 'project');
    expect(access.canAccess).not.toHaveBeenCalled();
    expect(reports.createQueryBuilder).not.toHaveBeenCalled();
  });

  it.each([undefined, { reportsCount: 0, dataMartCount: 0 }])(
    'returns zero counts when the Destination has no reports: %j',
    async rows => {
      const { service, query } = create();
      query.getRawOne.mockResolvedValue(rows);

      await expect(service.run(command)).resolves.toMatchObject({
        reportsCount: 0,
        dataMartCount: 0,
      });
    }
  );
});
