jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DeleteDataDestinationCommand } from '../dto/domain/delete-data-destination.command';
import { DeleteDataDestinationService } from './delete-data-destination.service';

function makeService(reportsCount = 0) {
  const dataDestinationRepository = { softDelete: jest.fn().mockResolvedValue(undefined) };
  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(reportsCount),
  };
  const reportRepository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const dataDestinationService = {
    getByIdAndProjectId: jest
      .fn()
      .mockResolvedValue({ id: 'dest-1', type: DataDestinationType.GOOGLE_SHEETS }),
  };
  const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(true) };
  const destinationCredentials = { deactivateDestination: jest.fn().mockResolvedValue(undefined) };
  const service = new DeleteDataDestinationService(
    dataDestinationRepository as never,
    reportRepository as never,
    dataDestinationService as never,
    accessDecisionService as never,
    destinationCredentials as never
  );
  return { service, dataDestinationRepository, destinationCredentials };
}

const command = new DeleteDataDestinationCommand('dest-1', 'proj-1', 'user-1', ['editor']);

describe('DeleteDataDestinationService', () => {
  it('deactivates the binding of a deleted Destination', async () => {
    const { service, dataDestinationRepository, destinationCredentials } = makeService();

    await service.run(command);

    expect(dataDestinationRepository.softDelete).toHaveBeenCalledWith({
      id: 'dest-1',
      projectId: 'proj-1',
    });
    expect(destinationCredentials.deactivateDestination).toHaveBeenCalledWith('dest-1');
  });

  it('keeps the binding when the Destination cannot be deleted', async () => {
    const { service, destinationCredentials } = makeService(2);

    await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
    expect(destinationCredentials.deactivateDestination).not.toHaveBeenCalled();
  });
});
