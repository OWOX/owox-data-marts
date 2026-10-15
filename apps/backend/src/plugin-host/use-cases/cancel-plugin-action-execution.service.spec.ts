import type { AuthorizationContext } from '../../idp/types/auth.types';
import type { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { ExecutionNotFoundError } from '../errors/plugin-action.errors';
import { CancelPluginActionExecutionService } from './cancel-plugin-action-execution.service';

const CONTEXT = {
  projectId: 'project-1',
  userId: 'user-1',
  pluginId: 'plugin-1',
  installationId: 'installation-1',
} as AuthorizationContext;

const row = (overrides: Partial<PluginActionExecution>) =>
  ({
    id: 'execution-1',
    installationId: 'installation-1',
    action: 'update-document',
    trigger: 'frontend',
    startedAt: new Date('2026-10-14T12:00:00.000Z'),
    deadlineAt: new Date('2026-10-14T12:01:00.000Z'),
    finishedAt: new Date('2026-10-14T12:00:10.000Z'),
    errorCode: null,
    errorMessage: null,
    result: null,
    ...overrides,
  }) as PluginActionExecution;

function setup(cancelled: boolean, stored: PluginActionExecution) {
  const executions = {
    cancel: jest.fn().mockResolvedValue(cancelled),
    findById: jest.fn().mockResolvedValue(stored),
  };
  return { executions, service: new CancelPluginActionExecutionService(executions as never) };
}

describe('CancelPluginActionExecutionService', () => {
  it('cancels a running execution of the caller installation and answers the stored row', async () => {
    const { service, executions } = setup(
      true,
      row({
        status: PluginActionExecutionStatus.CANCELLED,
        errorMessage: 'The execution was cancelled',
      })
    );

    await expect(service.run({ context: CONTEXT, id: 'execution-1' })).resolves.toMatchObject({
      status: 'CANCELLED',
      error: { code: 'CANCELLED', message: 'The execution was cancelled' },
    });
    expect(executions.cancel).toHaveBeenCalledWith('execution-1', 'installation-1');
  });

  it('answers a finished execution as it is', async () => {
    const { service } = setup(
      false,
      row({ status: PluginActionExecutionStatus.SUCCEEDED, result: { rows: 3 } })
    );

    await expect(service.run({ context: CONTEXT, id: 'execution-1' })).resolves.toMatchObject({
      status: 'SUCCEEDED',
      result: { rows: 3 },
      error: null,
    });
  });

  it("answers another installation's execution as not found", async () => {
    const { service } = setup(
      false,
      row({ status: PluginActionExecutionStatus.RUNNING, installationId: 'installation-2' })
    );

    await expect(service.run({ context: CONTEXT, id: 'execution-1' })).rejects.toBeInstanceOf(
      ExecutionNotFoundError
    );
  });
});
