import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetScheduledTriggerCommand } from '../dto/domain/get-scheduled-trigger.command';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { GetScheduledTriggerService } from './get-scheduled-trigger.service';

function fixture() {
  const trigger = {
    id: 'trigger',
    type: 'CONNECTOR_RUN',
    cronExpression: '0 9 * * *',
    timeZone: 'UTC',
    isActive: true,
  };
  const schedules = { getByIdAndDataMartIdAndProjectId: jest.fn().mockResolvedValue(trigger) };
  const projections = { fetchCreatedByUser: jest.fn().mockResolvedValue(null) };
  const dataMarts = { getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm' }) };
  const access = { canAccess: jest.fn().mockResolvedValue(true) };
  const service = new GetScheduledTriggerService(
    schedules as never,
    new ScheduledTriggerMapper(),
    projections as never,
    dataMarts as never,
    access as never
  );
  return { service, schedules, dataMarts, access };
}

describe('GetScheduledTriggerService', () => {
  const command = () =>
    new GetScheduledTriggerCommand('trigger', 'dm', 'project', 'user', ['viewer']);
  it('admits SEE before reading a trigger scoped to the actor project and Data Mart', async () => {
    const f = fixture();
    expect(await f.service.run(command())).toMatchObject({
      id: 'trigger',
      cronExpression: '0 9 * * *',
    });
    expect(f.dataMarts.getByIdAndProjectId).toHaveBeenCalledWith('dm', 'project');
    expect(f.access.canAccess).toHaveBeenCalledWith(
      'user',
      ['viewer'],
      'DATA_MART',
      'dm',
      'SEE',
      'project'
    );
    expect(f.schedules.getByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'trigger',
      'dm',
      'project'
    );
  });
  it('does not read private trigger details without Data Mart SEE', async () => {
    const f = fixture();
    f.access.canAccess.mockResolvedValue(false);
    f.dataMarts.getByIdAndProjectId.mockRejectedValue(new NotFoundException());
    await expect(f.service.run(command())).rejects.toThrow(ForbiddenException);
    expect(f.dataMarts.getByIdAndProjectId).not.toHaveBeenCalled();
    expect(f.schedules.getByIdAndDataMartIdAndProjectId).not.toHaveBeenCalled();
  });
  it('does not read triggers through a Data Mart from another project', async () => {
    const f = fixture();
    f.dataMarts.getByIdAndProjectId.mockRejectedValue(new NotFoundException());
    await expect(f.service.run(command())).rejects.toThrow(NotFoundException);
    expect(f.schedules.getByIdAndDataMartIdAndProjectId).not.toHaveBeenCalled();
  });
  it('does not treat an absent actor as internal authorization', async () => {
    const f = fixture();
    await expect(
      f.service.run(new GetScheduledTriggerCommand('trigger', 'dm', 'project', '', ['admin']))
    ).rejects.toThrow(ForbiddenException);
    expect(f.dataMarts.getByIdAndProjectId).not.toHaveBeenCalled();
    expect(f.schedules.getByIdAndDataMartIdAndProjectId).not.toHaveBeenCalled();
  });
});
