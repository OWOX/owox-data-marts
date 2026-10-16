import { NotFoundException } from '@nestjs/common';
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

  it('does not let a disconnected AI Credential deny the backend its context', async () => {
    const { service, credentialBindings } = setup();
    VERSIONS.set('version-2', {
      id: 'version-2',
      semver: '1.1.0',
      credentialRequirements: ['github', 'ai'],
    });
    try {
      await expect(service.run({ context: CONTEXT })).resolves.toMatchObject({
        credentialHandles: [{ name: 'github', kind: 'exact' }],
      });
      expect(credentialBindings.assertConsumerReady).toHaveBeenCalledWith(
        expect.objectContaining({ requirements: ['github'] })
      );
    } finally {
      VERSIONS.set('version-2', {
        id: 'version-2',
        semver: '1.1.0',
        credentialRequirements: ['github'],
      });
    }
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
});
