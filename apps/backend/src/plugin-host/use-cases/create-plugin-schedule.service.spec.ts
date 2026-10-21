import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { CreatePluginScheduleCommand } from '../dto/domain/plugin-action-schedule.command';
import { ExecutionTokenNotAllowedError } from '../errors/plugin-action.errors';
import { CreatePluginScheduleService } from './create-plugin-schedule.service';

const RUNTIME: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'alice',
  pluginId: 'p1',
  installationId: 'i1',
};
const EXECUTION: AuthorizationContext = { ...RUNTIME, executionId: 'e1' };
const BODY = { action: 'sync', cron: '0 9 * * *', timeZone: 'UTC' };

function setup() {
  const schedules = { create: jest.fn(async () => ({ id: 's1' })) };
  return { service: new CreatePluginScheduleService(schedules as never), schedules };
}

describe('CreatePluginScheduleService', () => {
  it("creates for the token's installation and plugin", async () => {
    const s = setup();

    await s.service.run(new CreatePluginScheduleCommand(RUNTIME, { ...BODY, enabled: false }));

    expect(s.schedules.create).toHaveBeenCalledWith(
      { installationId: 'i1', pluginId: 'p1', projectId: 'project-1' },
      { ...BODY, parameters: undefined, name: null },
      false
    );
  });

  it('refuses an execution token, before reading the body', async () => {
    const s = setup();

    const refusal = await s.service
      .run(new CreatePluginScheduleCommand(EXECUTION, {}))
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ExecutionTokenNotAllowedError);
    expect((refusal as Error).message).toBe('A backend action cannot change schedules');
    expect(s.schedules.create).not.toHaveBeenCalled();
  });

  it('refuses a body the route does not accept before the schedule service', async () => {
    const s = setup();

    await expect(
      s.service.run(new CreatePluginScheduleCommand(RUNTIME, { ...BODY, extra: 1 }))
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s.schedules.create).not.toHaveBeenCalled();
  });

  it('requires a plugin runtime identity', async () => {
    const s = setup();

    await expect(
      s.service.run(
        new CreatePluginScheduleCommand({ projectId: 'project-1', userId: 'alice' }, BODY)
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
