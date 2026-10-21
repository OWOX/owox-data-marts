jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RequirePluginAuth: () => () => undefined,
  Role: { viewer: jest.fn() },
  Strategy: { PARSE: 'parse' },
}));

import type { AuthorizationContext } from '../../idp';
import {
  CreatePluginScheduleCommand,
  ListPluginSchedulesCommand,
  PluginScheduleCommand,
  UpdatePluginScheduleCommand,
} from '../dto/domain/plugin-action-schedule.command';
import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import { PluginScheduleRuntimeController } from './plugin-schedule-runtime.controller';

const context = {
  projectId: 'project-1',
  userId: 'user-1',
  pluginId: 'plugin-1',
  installationId: 'installation-1',
} as AuthorizationContext;

const ID = '4f6c1f0e-5a8e-4d53-9c7e-0d3c2b1a9e11';

const view: PluginScheduleView = {
  id: ID,
  pluginId: context.pluginId,
  installationId: context.installationId,
  name: null,
  action: 'sync',
  parameters: { limit: 5 },
  cron: '0 8 * * *',
  timeZone: 'UTC',
  enabled: true,
  disabledReason: null,
  nextRunAt: new Date('2026-10-20T08:00:00.000Z'),
  lastRun: null,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  modifiedAt: new Date('2026-10-02T11:30:00.000Z'),
};

// The runtime response leaves out the ids the page needs, and has ISO dates.
const { pluginId: _pluginId, installationId: _installationId, ...runtimeView } = view;
const response = {
  ...runtimeView,
  nextRunAt: '2026-10-20T08:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  modifiedAt: '2026-10-02T11:30:00.000Z',
};

function setup() {
  const services = {
    create: { run: jest.fn().mockResolvedValue(view) },
    list: { run: jest.fn().mockResolvedValue([view]) },
    get: { run: jest.fn().mockResolvedValue(view) },
    update: { run: jest.fn().mockResolvedValue(view) },
    pause: { run: jest.fn().mockResolvedValue(view) },
    resume: { run: jest.fn().mockResolvedValue(view) },
    delete: { run: jest.fn().mockResolvedValue(undefined) },
  };
  const controller = new PluginScheduleRuntimeController(
    services.create as never,
    services.list as never,
    services.get as never,
    services.update as never,
    services.pause as never,
    services.resume as never,
    services.delete as never
  );
  return { controller, services };
}

describe('PluginScheduleRuntimeController', () => {
  it('create builds the command from the context and the raw body', async () => {
    const { controller, services } = setup();
    const body = { action: 'sync', cron: '0 8 * * *' };

    const result = await controller.create(body, context);

    expect(services.create.run).toHaveBeenCalledWith(
      new CreatePluginScheduleCommand(context, body)
    );
    expect(result).toStrictEqual(response);
  });

  it('create hands an absent body on as it is', async () => {
    const { controller, services } = setup();

    await controller.create(undefined, context);

    expect(services.create.run).toHaveBeenCalledWith(
      new CreatePluginScheduleCommand(context, undefined)
    );
  });

  it('list answers every schedule with its parameters', async () => {
    const { controller, services } = setup();

    const result = await controller.list(context);

    expect(services.list.run).toHaveBeenCalledWith(new ListPluginSchedulesCommand(context));
    expect(result).toStrictEqual({ schedules: [response] });
  });

  it.each(['get', 'pause', 'resume'] as const)('%s builds the command from the id', async route => {
    const { controller, services } = setup();

    const result = await controller[route](ID, context);

    expect(services[route].run).toHaveBeenCalledWith(new PluginScheduleCommand(context, ID));
    expect(result).toStrictEqual(response);
  });

  it('update builds the command from the id and the raw body', async () => {
    const { controller, services } = setup();
    const body = { name: 'Renamed' };

    const result = await controller.update(ID, body, context);

    expect(services.update.run).toHaveBeenCalledWith(
      new UpdatePluginScheduleCommand(context, ID, body)
    );
    expect(result).toStrictEqual(response);
  });

  it('delete runs the command and answers nothing', async () => {
    const { controller, services } = setup();

    await expect(controller.delete(ID, context)).resolves.toBeUndefined();
    expect(services.delete.run).toHaveBeenCalledWith(new PluginScheduleCommand(context, ID));
  });

  it('answers the status codes the routes declare', () => {
    const status = (name: keyof PluginScheduleRuntimeController) =>
      Reflect.getMetadata('__httpCode__', PluginScheduleRuntimeController.prototype[name]);

    expect(status('create')).toBe(201);
    expect(status('pause')).toBe(200);
    expect(status('resume')).toBe(200);
    expect(status('delete')).toBe(204);
  });
});
