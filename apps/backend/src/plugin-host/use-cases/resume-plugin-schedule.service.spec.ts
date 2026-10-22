import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import { ExecutionTokenNotAllowedError } from '../errors/plugin-action.errors';
import { ResumePluginScheduleService } from './resume-plugin-schedule.service';

const RUNTIME: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'alice',
  pluginId: 'p1',
  installationId: 'i1',
};
const EXECUTION: AuthorizationContext = { ...RUNTIME, executionId: 'e1' };

function setup() {
  const schedules = { resume: jest.fn(async () => ({ id: 's1' })) };
  return { service: new ResumePluginScheduleService(schedules as never), schedules };
}

describe('ResumePluginScheduleService', () => {
  it("calls the schedule service in the token's installation, as the plugin", async () => {
    const s = setup();

    await s.service.run(new PluginScheduleCommand(RUNTIME, 's1'));

    expect(s.schedules.resume).toHaveBeenCalledWith('i1', 's1', { byPlugin: true });
  });

  it('refuses an execution token', async () => {
    const s = setup();

    const refusal = await s.service
      .run(new PluginScheduleCommand(EXECUTION, 's1'))
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ExecutionTokenNotAllowedError);
    expect((refusal as Error).message).toBe('A backend action cannot change schedules');
    expect(s.schedules.resume).not.toHaveBeenCalled();
  });

  it('requires a plugin runtime identity', async () => {
    const s = setup();

    await expect(
      s.service.run(new PluginScheduleCommand({ projectId: 'project-1', userId: 'alice' }, 's1'))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
