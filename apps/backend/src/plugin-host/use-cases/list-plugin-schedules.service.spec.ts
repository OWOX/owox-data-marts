import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { ListPluginSchedulesCommand } from '../dto/domain/plugin-action-schedule.command';
import { ListPluginSchedulesService } from './list-plugin-schedules.service';

const RUNTIME: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'alice',
  pluginId: 'p1',
  installationId: 'i1',
};
const EXECUTION: AuthorizationContext = { ...RUNTIME, executionId: 'e1' };

function setup() {
  const schedules = { list: jest.fn(async () => [{ id: 's1' }]) };
  return { service: new ListPluginSchedulesService(schedules as never), schedules };
}

describe('ListPluginSchedulesService', () => {
  it('reads with a runtime token', async () => {
    const s = setup();

    await expect(s.service.run(new ListPluginSchedulesCommand(RUNTIME))).resolves.toEqual([
      { id: 's1' },
    ]);
    expect(s.schedules.list).toHaveBeenCalledWith('i1');
  });

  it('reads with an execution token', async () => {
    const s = setup();

    await expect(s.service.run(new ListPluginSchedulesCommand(EXECUTION))).resolves.toEqual([
      { id: 's1' },
    ]);
    expect(s.schedules.list).toHaveBeenCalledWith('i1');
  });

  it('requires a plugin runtime identity', async () => {
    const s = setup();

    await expect(
      s.service.run(new ListPluginSchedulesCommand({ projectId: 'project-1', userId: 'alice' }))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
