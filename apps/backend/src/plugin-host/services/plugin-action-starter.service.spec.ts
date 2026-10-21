import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import type { PluginVersion } from '../entities/plugin-version.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import {
  ActionInputInvalidError,
  ActionInputTooLargeError,
  ActionNotDeclaredError,
  TooManyExecutionsError,
} from '../errors/plugin-action.errors';
import { hashExecutionToken } from '../utils/execution-token.util';
import type { PluginBackendDeclaration } from '../utils/plugin-manifest.util';
import { ActionInputValidatorService, isOverBudget } from './action-input-validator.service';
import type {
  InsertRunningExecutionInput,
  InsertScheduledExecutionInput,
} from './plugin-action-execution.service';
import {
  PluginActionStarterService,
  type PluginActionStart,
} from './plugin-action-starter.service';

const BACKEND: PluginBackendDeclaration = {
  url: '/owox',
  actions: {
    'update-document': {
      timeoutSeconds: 60,
      input: {
        type: 'object',
        properties: { documentId: { type: 'string' } },
        required: ['documentId'],
        additionalProperties: false,
      },
    },
    'list-documents': { timeoutSeconds: 30 },
  },
};

const validator = new ActionInputValidatorService();

function setup(backend: PluginBackendDeclaration | null = BACKEND) {
  const executions = {
    assertWithinStartLimits: jest.fn().mockResolvedValue(undefined),
    insertRunning: jest.fn(async (input: InsertRunningExecutionInput) => ({
      id: 'execution-1',
      ...input,
    })),
    insertScheduled: jest.fn(async (input: InsertScheduledExecutionInput) => ({
      execution: { id: 'execution-2', ...input },
      queued: false,
    })),
  };
  const queue = { dispatchAndPromote: jest.fn() };
  const starter = new PluginActionStarterService(validator, executions as never, queue as never);
  const version = {
    id: 'version-1',
    pluginId: 'plugin-1',
    deliveryUrl: 'https://a.workers.dev/app/',
    backend,
  } as PluginVersion;
  const installation = { id: 'installation-1', projectId: 'project-1', userId: 'user-1' };
  const start = (action: string, input?: unknown, overrides: Partial<PluginActionStart> = {}) =>
    starter.start({
      installation,
      version,
      action,
      input,
      role: 'editor',
      trigger: 'frontend',
      ...overrides,
    });
  const startScheduled = (action: string, input?: unknown) =>
    starter.startScheduled({
      installation,
      version,
      action,
      input,
      role: 'viewer',
      scheduleId: 'schedule-1',
      scheduleVersion: 4,
    });
  return { start, startScheduled, executions, queue };
}

describe('PluginActionStarterService', () => {
  afterAll(() => validator.onModuleDestroy());

  it('records an execution with the given role and trigger, then dispatches it to the resolved backend', async () => {
    const { start, executions, queue } = setup();

    await expect(
      start('update-document', { documentId: 'd1' }, { role: 'viewer' })
    ).resolves.toEqual({ id: 'execution-1', status: PluginActionExecutionStatus.RUNNING });

    expect(executions.insertRunning).toHaveBeenCalledWith({
      pluginId: 'plugin-1',
      pluginVersionId: 'version-1',
      installationId: 'installation-1',
      projectId: 'project-1',
      userId: 'user-1',
      action: 'update-document',
      input: { documentId: 'd1' },
      inputBytes: Buffer.byteLength('{"documentId":"d1"}'),
      role: 'viewer',
      timeoutSeconds: 60,
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      trigger: 'frontend',
    });
    const [execution, backendUrl, token, timeoutSeconds] = queue.dispatchAndPromote.mock.calls[0];
    expect(execution).toMatchObject({ id: 'execution-1' });
    expect(backendUrl).toBe('https://a.workers.dev/owox');
    expect(hashExecutionToken(token)).toBe(executions.insertRunning.mock.calls[0][0].tokenHash);
    expect(timeoutSeconds).toBe(60);
    expect(executions.insertRunning.mock.invocationCallOrder[0]).toBeLessThan(
      queue.dispatchAndPromote.mock.invocationCallOrder[0]
    );
  });

  it('refuses a start over a limit before the validator runs, and never inserts', async () => {
    const { start, executions, queue } = setup();
    executions.assertWithinStartLimits.mockRejectedValue(new TooManyExecutionsError());
    const validate = jest.spyOn(validator, 'validate');

    await expect(start('update-document', { documentId: 'd1' })).rejects.toBeInstanceOf(
      TooManyExecutionsError
    );

    expect(executions.assertWithinStartLimits).toHaveBeenCalledWith(
      'installation-1',
      expect.any(Number)
    );
    expect(validate).not.toHaveBeenCalled();
    expect(executions.insertRunning).not.toHaveBeenCalled();
    expect(queue.dispatchAndPromote).not.toHaveBeenCalled();
    validate.mockRestore();
  });

  it.each(['delete-document', 'constructor', '__proto__'])('%s is not declared', async action => {
    const { start, executions } = setup();

    await expect(start(action)).rejects.toBeInstanceOf(ActionNotDeclaredError);
    expect(executions.insertRunning).not.toHaveBeenCalled();
  });

  it('refuses every action of a version without a backend', async () => {
    const { start } = setup(null);

    await expect(start('list-documents')).rejects.toBeInstanceOf(ActionNotDeclaredError);
  });

  it('stores null when an action without a schema gets no input', async () => {
    const { start, executions } = setup();

    await expect(start('list-documents')).resolves.toMatchObject({ id: 'execution-1' });
    expect(executions.insertRunning).toHaveBeenCalledWith(
      expect.objectContaining({ input: null, inputBytes: 0, timeoutSeconds: 30 })
    );
  });

  it('checks missing input against a schema that requires a field', async () => {
    const { start, executions } = setup();

    const error = await start('update-document').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ActionInputInvalidError);
    expect(error).toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Action input does not match the action schema',
      errorDetails: { errors: [{ instancePath: '', message: 'must be object' }] },
    });
    expect(executions.insertRunning).not.toHaveBeenCalled();
  });

  it('accepts input of exactly 256 KiB', async () => {
    const { start } = setup();
    const input = 'x'.repeat(PLUGIN_ACTION_LIMITS.maxInputBytes - 2);

    await expect(start('list-documents', input)).resolves.toMatchObject({ id: 'execution-1' });
  });

  it.each([
    ['one byte over', 'x'.repeat(PLUGIN_ACTION_LIMITS.maxInputBytes - 1)],
    ['in two-byte characters', 'é'.repeat(PLUGIN_ACTION_LIMITS.maxInputBytes / 2)],
  ])('refuses input above 256 KiB, %s', async (_label, input) => {
    const { start, executions } = setup();

    await expect(start('list-documents', input)).rejects.toBeInstanceOf(ActionInputTooLargeError);
    expect(executions.insertRunning).not.toHaveBeenCalled();
  });

  function nested(depth: number): unknown {
    let value: unknown = [];
    for (let level = 1; level < depth; level += 1) value = [value];
    return value;
  }

  it('accepts input nested 100 levels deep', async () => {
    const { start } = setup();

    await expect(start('list-documents', nested(100))).resolves.toMatchObject({
      id: 'execution-1',
    });
  });

  it.each([
    ['nested 101 levels deep', nested(101), 'is nested deeper than 100 levels'],
    ['nested 10,000 levels deep', nested(10_000), 'is nested deeper than 100 levels'],
  ])('refuses input %s as INVALID_INPUT', async (_label, input, message) => {
    const { start, executions } = setup();

    const error = await start('list-documents', input).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ActionInputInvalidError);
    expect(error).toMatchObject({
      code: 'INVALID_INPUT',
      errorDetails: { errors: [{ instancePath: '', message }] },
    });
    expect(executions.insertRunning).not.toHaveBeenCalled();
  });

  it('dispatches nothing when no running slot is free', async () => {
    const { start, executions, queue } = setup();
    executions.insertRunning.mockRejectedValue(new TooManyExecutionsError());

    await expect(start('list-documents')).rejects.toBeInstanceOf(TooManyExecutionsError);
    expect(queue.dispatchAndPromote).not.toHaveBeenCalled();
  });

  describe('startScheduled', () => {
    it('records a scheduled execution and dispatches it when a slot is free', async () => {
      const { startScheduled, executions, queue } = setup();

      await expect(startScheduled('update-document', { documentId: 'd1' })).resolves.toEqual({
        id: 'execution-2',
        status: PluginActionExecutionStatus.RUNNING,
      });

      expect(executions.insertScheduled).toHaveBeenCalledWith({
        pluginId: 'plugin-1',
        pluginVersionId: 'version-1',
        installationId: 'installation-1',
        projectId: 'project-1',
        userId: 'user-1',
        action: 'update-document',
        input: { documentId: 'd1' },
        inputBytes: Buffer.byteLength('{"documentId":"d1"}'),
        role: 'viewer',
        timeoutSeconds: 60,
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        scheduleId: 'schedule-1',
        scheduleVersion: 4,
      });
      const [execution, backendUrl, token, timeoutSeconds] = queue.dispatchAndPromote.mock.calls[0];
      expect(execution).toMatchObject({ id: 'execution-2' });
      expect(backendUrl).toBe('https://a.workers.dev/owox');
      expect(hashExecutionToken(token)).toBe(executions.insertScheduled.mock.calls[0][0].tokenHash);
      expect(timeoutSeconds).toBe(60);
    });

    it('inserts QUEUED when a limit refuses, and does not dispatch it', async () => {
      const { startScheduled, executions, queue } = setup();
      executions.insertScheduled.mockImplementationOnce(async input => ({
        execution: { id: 'execution-2', ...input },
        queued: true,
      }));

      await expect(startScheduled('list-documents')).resolves.toEqual({
        id: 'execution-2',
        status: PluginActionExecutionStatus.QUEUED,
      });
      expect(queue.dispatchAndPromote).not.toHaveBeenCalled();
    });

    it('leaves the limits to the locked insert, with no early check', async () => {
      const { startScheduled, executions } = setup();

      await startScheduled('list-documents');

      expect(executions.assertWithinStartLimits).not.toHaveBeenCalled();
    });

    it("hands the validator's over-budget answer on, so the handler can tell it apart", async () => {
      const { startScheduled } = setup({
        url: '/owox',
        actions: { slow: { timeoutSeconds: 30, input: { $async: true } } },
      });

      const error = await startScheduled('slow', 1).catch((refusal: unknown) => refusal);

      expect(error).toBeInstanceOf(ActionInputInvalidError);
      expect(isOverBudget((error as ActionInputInvalidError).errorDetails?.errors)).toBe(true);
    });

    it.each([
      ['an undeclared action', 'delete-document', undefined, ActionNotDeclaredError],
      [
        'input that does not match the schema',
        'update-document',
        { documentId: 1 },
        ActionInputInvalidError,
      ],
      [
        'input above 256 KiB',
        'list-documents',
        'x'.repeat(PLUGIN_ACTION_LIMITS.maxInputBytes - 1),
        ActionInputTooLargeError,
      ],
    ])('refuses %s as start does, and inserts nothing', async (_label, action, input, refusal) => {
      const { startScheduled, executions } = setup();

      await expect(startScheduled(action, input)).rejects.toBeInstanceOf(refusal);
      expect(executions.insertScheduled).not.toHaveBeenCalled();
    });
  });
});
