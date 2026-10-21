import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import { GetPluginScheduleService } from './get-plugin-schedule.service';

const RUNTIME: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'alice',
  pluginId: 'p1',
  installationId: 'i1',
};
const EXECUTION: AuthorizationContext = { ...RUNTIME, executionId: 'e1' };

function setup() {
  const schedules = { get: jest.fn(async () => ({ id: 's1' })) };
  return { service: new GetPluginScheduleService(schedules as never), schedules };
}

describe('GetPluginScheduleService', () => {
  it('reads with a runtime token', async () => {
    const s = setup();

    await expect(s.service.run(new PluginScheduleCommand(RUNTIME, 's1'))).resolves.toEqual({
      id: 's1',
    });
    expect(s.schedules.get).toHaveBeenCalledWith('i1', 's1');
  });

  it('reads with an execution token', async () => {
    const s = setup();

    await expect(s.service.run(new PluginScheduleCommand(EXECUTION, 's1'))).resolves.toEqual({
      id: 's1',
    });
    expect(s.schedules.get).toHaveBeenCalledWith('i1', 's1');
  });

  it('requires a plugin runtime identity', async () => {
    const s = setup();

    await expect(
      s.service.run(new PluginScheduleCommand({ projectId: 'project-1', userId: 'alice' }, 's1'))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
