import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { UpdatePluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import { ExecutionTokenNotAllowedError } from '../errors/plugin-action.errors';
import { UpdatePluginScheduleService } from './update-plugin-schedule.service';

const RUNTIME: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'alice',
  pluginId: 'p1',
  installationId: 'i1',
};
const EXECUTION: AuthorizationContext = { ...RUNTIME, executionId: 'e1' };

function setup() {
  const schedules = { update: jest.fn(async () => ({ id: 's1' })) };
  return { service: new UpdatePluginScheduleService(schedules as never), schedules };
}

describe('UpdatePluginScheduleService', () => {
  it("updates in the token's installation", async () => {
    const s = setup();

    await s.service.run(new UpdatePluginScheduleCommand(RUNTIME, 's1', { name: null }));

    expect(s.schedules.update).toHaveBeenCalledWith('i1', 's1', { name: null });
  });

  it('refuses an execution token, before reading the body', async () => {
    const s = setup();

    const refusal = await s.service
      .run(new UpdatePluginScheduleCommand(EXECUTION, 's1', { enabled: true }))
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ExecutionTokenNotAllowedError);
    expect((refusal as Error).message).toBe('A backend action cannot change schedules');
    expect(s.schedules.update).not.toHaveBeenCalled();
  });

  it('refuses a body the route does not accept before the schedule service', async () => {
    const s = setup();

    await expect(
      s.service.run(new UpdatePluginScheduleCommand(RUNTIME, 's1', { enabled: false }))
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s.schedules.update).not.toHaveBeenCalled();
  });

  it('requires a plugin runtime identity', async () => {
    const s = setup();

    await expect(
      s.service.run(
        new UpdatePluginScheduleCommand({ projectId: 'project-1', userId: 'alice' }, 's1', {})
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
