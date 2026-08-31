jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { ResolveExcelDestinationCommand } from '../dto/domain/resolve-excel-destination.command';
import { ResolveExcelDestinationService } from './resolve-excel-destination.service';

describe('ResolveExcelDestinationService', () => {
  function setup(existing: { id: string }[], canUse = true) {
    const dataDestinationService = {
      listByProjectIdAndType: jest.fn().mockResolvedValue(existing),
    };
    const createService = { run: jest.fn().mockResolvedValue({ id: 'created-1' }) };
    const getService = { run: jest.fn().mockResolvedValue({ id: 'existing-1' }) };
    const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(canUse) };

    const service = new ResolveExcelDestinationService(
      dataDestinationService as never,
      createService as never,
      getService as never,
      accessDecisionService as never
    );

    return { service, dataDestinationService, createService, getService, accessDecisionService };
  }

  const command = new ResolveExcelDestinationCommand('project-1', 'user-1', ['viewer']);

  it('creates the destination the first time it is asked for', async () => {
    const { service, createService } = setup([]);

    await expect(service.run(command)).resolves.toEqual({ id: 'created-1' });
    expect(createService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        type: DataDestinationType.EXCEL,
        userId: 'user-1',
        // No credentials: an Excel destination holds no secret, and passing an empty one would
        // write a meaningless credential record.
        credentials: undefined,
        // What makes it reachable by everyone else in the project.
        availableForUse: true,
      })
    );
  });

  it('returns the existing destination instead of making a second one', async () => {
    const { service, createService, getService } = setup([{ id: 'existing-1' }]);

    await expect(service.run(command)).resolves.toEqual({ id: 'existing-1' });
    expect(createService.run).not.toHaveBeenCalled();
    expect(getService.run).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing-1', projectId: 'project-1', userId: 'user-1' })
    );
  });

  it('looks across the whole project, not only the caller’s own destinations', async () => {
    // A destination shared for use already gives every project member SEE and USE, so a copy
    // per user would only clutter the project with identical rows.
    const { service, dataDestinationService } = setup([]);

    await service.run(command);

    expect(dataDestinationService.listByProjectIdAndType).toHaveBeenCalledWith(
      'project-1',
      DataDestinationType.EXCEL
    );
  });

  it('creates one when the existing destination is not usable by the caller', async () => {
    // Handing back a destination the caller cannot use would 403 them with no way out: the
    // unusable row would keep blocking the creation of one they can use.
    const { service, createService, getService } = setup([{ id: 'someone-elses' }], false);

    await expect(service.run(command)).resolves.toEqual({ id: 'created-1' });
    expect(getService.run).not.toHaveBeenCalled();
    expect(createService.run).toHaveBeenCalled();
  });
});
