import type { AuthorizationContext } from '../../idp/types/auth.types';
import type { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { ExecutionNotFoundError } from '../errors/plugin-action.errors';
import { GetPluginActionExecutionService } from './get-plugin-action-execution.service';

const CONTEXT = {
  projectId: 'project-1',
  userId: 'user-1',
  pluginId: 'plugin-1',
  installationId: 'installation-1',
} as AuthorizationContext;

const running = {
  id: 'execution-1',
  installationId: 'installation-1',
  action: 'update-document',
  trigger: 'frontend',
  status: PluginActionExecutionStatus.RUNNING,
  startedAt: new Date('2026-10-14T12:00:00.000Z'),
  deadlineAt: new Date('2026-10-14T12:01:00.000Z'),
  finishedAt: null,
  errorCode: null,
  errorMessage: null,
  result: null,
} as PluginActionExecution;
const succeeded = {
  ...running,
  status: PluginActionExecutionStatus.SUCCEEDED,
  result: { rows: 3 },
} as PluginActionExecution;

function setup() {
  const executions = {
    findById: jest.fn().mockResolvedValue(running),
    findStatus: jest.fn().mockResolvedValue(PluginActionExecutionStatus.RUNNING),
  };
  return { executions, service: new GetPluginActionExecutionService(executions as never) };
}

function read(
  service: GetPluginActionExecutionService,
  waitSeconds: number,
  signal = new AbortController().signal
) {
  return service.run({ context: CONTEXT, id: 'execution-1', waitSeconds, signal });
}

describe('GetPluginActionExecutionService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('answers at once without waitSeconds', async () => {
    const { service, executions } = setup();

    await expect(read(service, 0)).resolves.toMatchObject({ id: 'execution-1', status: 'RUNNING' });
    expect(executions.findById).toHaveBeenCalledTimes(1);
    expect(executions.findStatus).not.toHaveBeenCalled();
  });

  it('does not wait for an execution that has finished', async () => {
    const { service, executions } = setup();
    executions.findById.mockResolvedValue(succeeded);

    await expect(read(service, 20)).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(executions.findById).toHaveBeenCalledTimes(1);
    expect(executions.findStatus).not.toHaveBeenCalled();
  });

  it('polls the status and reads the full row once it is final', async () => {
    const { service, executions } = setup();
    executions.findById.mockResolvedValueOnce(running).mockResolvedValue(succeeded);
    executions.findStatus
      .mockResolvedValueOnce(PluginActionExecutionStatus.RUNNING)
      .mockResolvedValue(PluginActionExecutionStatus.SUCCEEDED);

    const answer = read(service, 20);
    await jest.advanceTimersByTimeAsync(2000);

    await expect(answer).resolves.toMatchObject({ status: 'SUCCEEDED', result: { rows: 3 } });
    expect(executions.findStatus).toHaveBeenCalledTimes(2);
    expect(executions.findStatus).toHaveBeenCalledWith('execution-1');
    expect(executions.findById).toHaveBeenCalledTimes(2);
  });

  it('answers the last state once waitSeconds pass', async () => {
    const { service, executions } = setup();

    const answer = read(service, 3);
    await jest.advanceTimersByTimeAsync(3000);

    await expect(answer).resolves.toMatchObject({ status: 'RUNNING' });
    expect(executions.findStatus).toHaveBeenCalledTimes(3);
    expect(executions.findById).toHaveBeenCalledTimes(2);
  });

  it('stops waiting when the request closes', async () => {
    const { service, executions } = setup();
    const closed = new AbortController();

    const answer = read(service, 20, closed.signal);
    await jest.advanceTimersByTimeAsync(1500);
    closed.abort();

    await expect(answer).resolves.toMatchObject({ status: 'RUNNING' });
    expect(executions.findStatus).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('answers not found when the row disappears during the wait', async () => {
    const { service, executions } = setup();
    executions.findById.mockResolvedValueOnce(running).mockResolvedValue(null);
    executions.findStatus.mockResolvedValue(null);

    const answer = read(service, 20);
    const rejection = expect(answer).rejects.toBeInstanceOf(ExecutionNotFoundError);
    await jest.advanceTimersByTimeAsync(1000);

    await rejection;
    expect(executions.findStatus).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing', null],
    ['of another installation', { ...running, installationId: 'installation-2' }],
  ])('answers an execution %s as not found', async (_label, row) => {
    const { service, executions } = setup();
    executions.findById.mockResolvedValue(row);

    await expect(read(service, 20)).rejects.toBeInstanceOf(ExecutionNotFoundError);
    expect(executions.findStatus).not.toHaveBeenCalled();
  });
});
