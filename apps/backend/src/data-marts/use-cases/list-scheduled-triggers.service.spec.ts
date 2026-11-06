import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ListScheduledTriggersCommand } from '../dto/domain/list-scheduled-triggers.command';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ListScheduledTriggersService } from './list-scheduled-triggers.service';

function fixture() {
  const schedules = {
    getAllByDataMartIdAndProjectId: jest
      .fn()
      .mockResolvedValue([{ id: 'trigger', type: 'CONNECTOR_RUN', cronExpression: '0 9 * * *' }]),
  };
  const projections = { fetchRelevantUserProjections: jest.fn().mockResolvedValue(undefined) };
  const dataMarts = { getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm' }) };
  const access = { canAccess: jest.fn().mockResolvedValue(true) };
  const service = new ListScheduledTriggersService(
    schedules as never,
    new ScheduledTriggerMapper(),
    projections as never,
    dataMarts as never,
    access as never
  );
  return { service, schedules, dataMarts, access };
}

describe('ListScheduledTriggersService', () => {
  const command = () => new ListScheduledTriggersCommand('dm', 'project', 'user', ['viewer']);
  it('lists through the shared project and SEE admission before returning DTOs', async () => {
    const f = fixture();
    expect(await f.service.run(command())).toMatchObject([
      { id: 'trigger', type: 'CONNECTOR_RUN' },
    ]);
    expect(f.dataMarts.getByIdAndProjectId).toHaveBeenCalledWith('dm', 'project');
    expect(f.access.canAccess).toHaveBeenCalledWith(
      'user',
      ['viewer'],
      'DATA_MART',
      'dm',
      'SEE',
      'project'
    );
    expect(f.schedules.getAllByDataMartIdAndProjectId).toHaveBeenCalledWith('dm', 'project');
  });
  it('does not query schedules for a project-scoped Data Mart that does not exist', async () => {
    const f = fixture();
    f.dataMarts.getByIdAndProjectId.mockRejectedValue(new NotFoundException());
    await expect(f.service.run(command())).rejects.toThrow(NotFoundException);
    expect(f.schedules.getAllByDataMartIdAndProjectId).not.toHaveBeenCalled();
  });
  it('does not enumerate schedules without SEE', async () => {
    const f = fixture();
    f.access.canAccess.mockResolvedValue(false);
    f.dataMarts.getByIdAndProjectId.mockRejectedValue(new NotFoundException());
    await expect(f.service.run(command())).rejects.toThrow(ForbiddenException);
    expect(f.dataMarts.getByIdAndProjectId).not.toHaveBeenCalled();
    expect(f.schedules.getAllByDataMartIdAndProjectId).not.toHaveBeenCalled();
  });
  it('rejects a missing actor before enumerating schedules', async () => {
    const f = fixture();
    await expect(
      f.service.run(new ListScheduledTriggersCommand('dm', 'project', '', ['admin']))
    ).rejects.toThrow(ForbiddenException);
    expect(f.dataMarts.getByIdAndProjectId).not.toHaveBeenCalled();
    expect(f.schedules.getAllByDataMartIdAndProjectId).not.toHaveBeenCalled();
  });
});
