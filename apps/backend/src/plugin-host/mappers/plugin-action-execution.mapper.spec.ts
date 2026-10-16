import type { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { toPluginActionExecutionView } from './plugin-action-execution.mapper';

const STARTED_AT = new Date('2026-10-14T12:00:00.000Z');
const DEADLINE_AT = new Date('2026-10-14T12:01:00.000Z');
const FINISHED_AT = new Date('2026-10-14T12:00:30.000Z');

function execution(overrides: Partial<PluginActionExecution> = {}): PluginActionExecution {
  return {
    id: 'execution-1',
    pluginId: 'plugin-1',
    pluginVersionId: 'version-1',
    installationId: 'installation-1',
    projectId: 'project-1',
    userId: 'user-1',
    action: 'update-document',
    input: { documentId: 'd1' },
    trigger: 'frontend',
    status: PluginActionExecutionStatus.RUNNING,
    role: 'editor',
    tokenHash: 'a'.repeat(64),
    deadlineAt: DEADLINE_AT,
    createdAt: STARTED_AT,
    startedAt: STARTED_AT,
    finishedAt: null,
    errorCode: null,
    errorMessage: null,
    result: null,
    payloadsClearedAt: null,
    payloadBytes: 0,
    ...overrides,
  };
}

describe('toPluginActionExecutionView', () => {
  it('shows a running execution without its input, role or token', () => {
    expect(toPluginActionExecutionView(execution())).toEqual({
      id: 'execution-1',
      action: 'update-document',
      status: 'RUNNING',
      trigger: 'frontend',
      startedAt: STARTED_AT,
      deadlineAt: DEADLINE_AT,
      finishedAt: null,
      result: null,
      error: null,
    });
  });

  it('shows no error for a status that is not final', () => {
    const queued = execution({ status: 'QUEUED' as PluginActionExecutionStatus });

    expect(toPluginActionExecutionView(queued)).toMatchObject({ status: 'QUEUED', error: null });
  });

  it.each([
    [
      'SUCCEEDED',
      { status: PluginActionExecutionStatus.SUCCEEDED, result: { rows: 3 } },
      { rows: 3 },
      null,
    ],
    [
      'FAILED',
      {
        status: PluginActionExecutionStatus.FAILED,
        errorCode: 'SHEET_NOT_FOUND',
        errorMessage: 'No such sheet',
      },
      null,
      { code: 'SHEET_NOT_FOUND', message: 'No such sheet' },
    ],
    [
      'FAILED without a message',
      { status: PluginActionExecutionStatus.FAILED, errorCode: 'BACKEND_INVALID_RESPONSE' },
      null,
      { code: 'BACKEND_INVALID_RESPONSE', message: '' },
    ],
    [
      'CANCELLED',
      {
        status: PluginActionExecutionStatus.CANCELLED,
        errorMessage: 'The execution was cancelled',
      },
      null,
      { code: 'CANCELLED', message: 'The execution was cancelled' },
    ],
    [
      'CANCELLED without a message',
      { status: PluginActionExecutionStatus.CANCELLED },
      null,
      { code: 'CANCELLED', message: '' },
    ],
    [
      'TIMED_OUT',
      {
        status: PluginActionExecutionStatus.TIMED_OUT,
        errorMessage: 'The action did not finish within 60 s',
      },
      null,
      { code: 'TIMED_OUT', message: 'The action did not finish within 60 s' },
    ],
  ])('maps %s', (_label, overrides, result, error) => {
    expect(
      toPluginActionExecutionView(execution({ ...overrides, finishedAt: FINISHED_AT }))
    ).toMatchObject({ finishedAt: FINISHED_AT, result, error });
  });
});
