import { Logger, NotFoundException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import {
  ExecutionNotFoundError,
  ExecutionTokenRequiredError,
} from '../errors/plugin-action.errors';
import { GetCurrentPluginActionExecutionService } from './get-current-plugin-action-execution.service';

const DEADLINE_AT = new Date('2026-10-14T12:01:00.000Z');

const CONTEXT: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'user-1',
  roles: ['editor'],
  authFlow: 'plugin',
  pluginId: 'plugin-1',
  installationId: 'installation-1',
  executionId: 'execution-1',
};

const EXECUTION = {
  id: 'execution-1',
  pluginId: 'plugin-1',
  pluginVersionId: 'version-1',
  installationId: 'installation-1',
  projectId: 'project-1',
  userId: 'user-1',
  action: 'list-documents',
  input: { page: 1 },
  trigger: 'frontend',
  scheduleId: null,
  status: PluginActionExecutionStatus.RUNNING,
  role: 'editor',
  deadlineAt: DEADLINE_AT,
};

const VERSIONS = new Map([
  ['version-1', { id: 'version-1', semver: '1.0.0', credentialRequirements: [] }],
  ['version-2', { id: 'version-2', semver: '1.1.0', credentialRequirements: ['github'] }],
]);

function setup() {
  const executions = { findWithInput: jest.fn().mockResolvedValue(EXECUTION) };
  const plugins = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'plugin-1', githubRepoId: '123456', currentVersionId: 'version-2' }),
  };
  const versions = { findById: jest.fn(async (id: string) => VERSIONS.get(id) ?? null) };
  const credentialBindings = {
    assertConsumerReady: jest
      .fn()
      .mockResolvedValue([{ key: 'github', definitionId: 'github', optional: false, models: [] }]),
  };
  const service = new GetCurrentPluginActionExecutionService(
    executions as never,
    plugins as never,
    versions as never,
    credentialBindings as never
  );
  return { service, executions, credentialBindings };
}

describe('GetCurrentPluginActionExecutionService', () => {
  it('refuses a runtime token', async () => {
    const { service, executions } = setup();

    await expect(
      service.run({ context: { ...CONTEXT, executionId: undefined } })
    ).rejects.toBeInstanceOf(ExecutionTokenRequiredError);
    expect(executions.findWithInput).not.toHaveBeenCalled();
  });

  it("answers the start release and the current release's credential handles", async () => {
    const { service, credentialBindings } = setup();

    await expect(service.run({ context: CONTEXT })).resolves.toEqual({
      executionId: 'execution-1',
      action: 'list-documents',
      input: { page: 1 },
      trigger: 'frontend',
      scheduleId: null,
      deadlineAt: DEADLINE_AT,
      plugin: { id: 'plugin-1', repositoryId: '123456' },
      pluginVersion: '1.0.0',
      installationId: 'installation-1',
      projectId: 'project-1',
      userId: 'user-1',
      credentialHandles: [{ name: 'github', kind: 'exact' }],
    });
    expect(credentialBindings.assertConsumerReady).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      consumerType: 'plugin-installation',
      consumerId: 'installation-1',
      requirements: ['github'],
    });
  });

  describe('for a release that also requires an AI Credential', () => {
    beforeEach(() => {
      VERSIONS.set('version-2', {
        id: 'version-2',
        semver: '1.1.0',
        credentialRequirements: ['github', 'ai'],
      });
    });
    afterEach(() => {
      VERSIONS.set('version-2', {
        id: 'version-2',
        semver: '1.1.0',
        credentialRequirements: ['github'],
      });
    });

    const AI_READY = { key: 'ai', definitionId: null, optional: false, models: ['fast'] };

    it('answers AI Credential handles, as the plugin page gets them, to an SDK that asks', async () => {
      const { service, credentialBindings } = setup();
      credentialBindings.assertConsumerReady.mockImplementation(
        async ({ requirements }: { requirements: string[] }) =>
          requirements.includes('ai')
            ? [AI_READY]
            : [{ key: 'github', definitionId: 'github', optional: false, models: [] }]
      );

      await expect(service.run({ context: CONTEXT, aiCredentials: true })).resolves.toMatchObject({
        credentialHandles: [
          { name: 'github', kind: 'exact' },
          { name: 'ai', kind: 'ai', models: ['fast'] },
        ],
      });
      expect(credentialBindings.assertConsumerReady).toHaveBeenCalledWith(
        expect.objectContaining({ requirements: ['github'] })
      );
      expect(credentialBindings.assertConsumerReady).toHaveBeenCalledWith(
        expect.objectContaining({ requirements: ['ai'] })
      );
    });

    it('keeps an SDK without AI support to exact Credentials, as before', async () => {
      const { service, credentialBindings } = setup();

      await expect(service.run({ context: CONTEXT })).resolves.toMatchObject({
        credentialHandles: [{ name: 'github', kind: 'exact' }],
      });
      expect(credentialBindings.assertConsumerReady).toHaveBeenCalledWith(
        expect.objectContaining({ requirements: ['github'] })
      );
    });

    it('leaves an unusable AI Credential out, says why in the log, and still answers the context', async () => {
      const { service, credentialBindings } = setup();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      credentialBindings.assertConsumerReady.mockImplementation(
        async ({ requirements }: { requirements: string[] }) => {
          if (requirements.includes('ai')) {
            throw new NotFoundException('Credential ai is not configured');
          }
          return [{ key: 'github', definitionId: 'github', optional: false, models: [] }];
        }
      );

      await expect(service.run({ context: CONTEXT, aiCredentials: true })).resolves.toMatchObject({
        credentialHandles: [{ name: 'github', kind: 'exact' }],
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/AI Credential ai left out .*: Credential ai is not configured/)
      );
      warn.mockRestore();
    });

    it('still fails on an error that is not an unusable AI Credential', async () => {
      const { service, credentialBindings } = setup();
      credentialBindings.assertConsumerReady.mockImplementation(
        async ({ requirements }: { requirements: string[] }) => {
          if (requirements.includes('ai')) throw new Error('database is down');
          return [];
        }
      );

      await expect(service.run({ context: CONTEXT, aiCredentials: true })).rejects.toThrow(
        'database is down'
      );
    });
  });

  it('passes on an unusable required credential', async () => {
    const { service, credentialBindings } = setup();
    credentialBindings.assertConsumerReady.mockRejectedValue(
      new NotFoundException('Credential is not connected')
    );

    await expect(service.run({ context: CONTEXT })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers an execution of another installation as not found', async () => {
    const { service, executions } = setup();
    executions.findWithInput.mockResolvedValue({ ...EXECUTION, installationId: 'installation-2' });

    await expect(service.run({ context: CONTEXT })).rejects.toBeInstanceOf(ExecutionNotFoundError);
  });

  it('tells a scheduled run which schedule started it', async () => {
    const { service, executions } = setup();
    executions.findWithInput.mockResolvedValue({
      ...EXECUTION,
      trigger: 'schedule',
      scheduleId: 'schedule-1',
    });

    await expect(service.run({ context: CONTEXT })).resolves.toMatchObject({
      trigger: 'schedule',
      scheduleId: 'schedule-1',
    });
  });
});
