import type { AuthorizationContext } from '../../../idp';
jest.mock('typeorm-transactional', () => ({ Transactional: () => () => {} }));
import { ForbiddenException } from '@nestjs/common';
import type { McpUpdateCredentialInput } from './mcp-credentials.facade';
import { McpCredentialMapper } from '../mappers/mcp-credential.mapper';
import { McpCredentialsFacadeImpl } from './mcp-credentials.facade.impl';

describe('McpCredentialsFacadeImpl', () => {
  const actor: AuthorizationContext = { projectId: 'project', userId: 'user', roles: ['viewer'] };
  const context = { ...actor, authFlow: 'mcp' };
  const safe = { id: 'safe' };
  const raw = { id: 'credential', validationMessage: 'secret-marker' };
  const service = () => ({ run: jest.fn().mockResolvedValue(raw) });
  const listDefinitions = service();
  const listCredentials = service();
  const getCredential = service();
  const updateCredential = service();
  const validateCredential = service();
  const consentCredentialDefinition = service();
  const deleteCredential = service();
  const startSetup = service();
  const waitSetup = service();
  const mapper = Object.assign(new McpCredentialMapper(), {
    toResolvedDefinition: jest.fn().mockReturnValue(safe),
    toCredential: jest.fn().mockReturnValue(safe),
    toListItem: jest.fn().mockReturnValue(safe),
  });
  const facade = new McpCredentialsFacadeImpl(
    listDefinitions as never,
    listCredentials as never,
    getCredential as never,
    updateCredential as never,
    validateCredential as never,
    consentCredentialDefinition as never,
    deleteCredential as never,
    startSetup as never,
    waitSetup as never,
    mapper as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('maps definitions and visible list items through the safe mapper', async () => {
    listDefinitions.run.mockResolvedValueOnce([raw]);
    listCredentials.run.mockResolvedValueOnce([raw]);
    expect(await facade.listDefinitions()).toEqual([safe]);
    expect(await facade.list(actor)).toEqual([safe]);
    expect(listCredentials.run).toHaveBeenCalledWith(context);
    expect(mapper.toResolvedDefinition).toHaveBeenCalledWith(raw);
    expect(mapper.toListItem).toHaveBeenCalledWith(raw);
  });

  it.each([
    ['get', getCredential],
    ['validate', validateCredential],
    ['consentDefinition', consentCredentialDefinition],
  ] as const)('%s retains the actor and maps the result', async (method, dependency) => {
    expect(await facade[method](actor, 'credential')).toEqual(safe);
    expect(dependency.run).toHaveBeenCalledWith('credential', context);
    expect(mapper.toCredential).toHaveBeenCalledWith(raw);
  });

  it('copies only safe fields to the update use case even if another caller bypasses MCP parsing', async () => {
    const input = {
      title: 'Updated',
      enabled: false,
      ownerIds: ['owner'],
      contextIds: [],
      availableForUse: false,
      availableForMaintenance: true,
      aiModelMappings: null,
      aiModelMappingModes: { fast: 'recommended' },
      secret: { value: 'secret-marker' },
      fields: { password: 'secret-marker' },
      hosts: ['private'],
      fieldList: [],
      publicMetadata: { leaked: 'secret-marker' },
    } as McpUpdateCredentialInput;
    expect(await facade.update(actor, 'credential', input)).toEqual(safe);
    expect(updateCredential.run).toHaveBeenCalledWith('credential', context, {
      title: 'Updated',
      enabled: false,
      ownerIds: ['owner'],
      contextIds: [],
      availableForUse: false,
      availableForMaintenance: true,
      aiModelMappings: null,
      aiModelMappingModes: { fast: 'recommended' },
    });
  });

  it('preserves omitted update fields', async () => {
    await facade.update(actor, 'credential', { title: 'Updated' });
    const payload = updateCredential.run.mock.calls[0][2];
    expect(payload.title).toBe('Updated');
    expect(payload.ownerIds).toBeUndefined();
    expect(payload.aiModelMappings).toBeUndefined();
  });

  it('allowlists AI capabilities without forwarding extra nested fields', async () => {
    await facade.update(actor, 'credential', {
      aiModelMappings: { fast: 'model-1', token: 'secret-marker' },
      aiModelMappingModes: { fast: 'override', hidden: 'secret-marker' },
    } as McpUpdateCredentialInput);
    expect(updateCredential.run.mock.calls[0][2]).toMatchObject({
      aiModelMappings: { fast: 'model-1' },
      aiModelMappingModes: { fast: 'override' },
    });
    expect(JSON.stringify(updateCredential.run.mock.calls[0][2])).not.toContain('secret-marker');
  });

  it('keeps resource denials and actor-scoped deletion in the existing use cases', async () => {
    getCredential.run.mockRejectedValueOnce(new ForbiddenException('Denied'));
    await expect(facade.get(actor, 'credential')).rejects.toThrow(ForbiddenException);
    expect(mapper.toCredential).not.toHaveBeenCalled();
    await facade.delete(actor, 'credential');
    expect(deleteCredential.run).toHaveBeenCalledWith('credential', context);
  });

  it('propagates setup identity, bounded wait and cancellation', async () => {
    const signal = new AbortController().signal;
    await facade.startSetup(actor, { credentialId: 'credential' });
    expect(startSetup.run).toHaveBeenCalledWith({ context, input: { credentialId: 'credential' } });
    await facade.getSetupStatus(actor, 'setup', 25, signal);
    expect(waitSetup.run).toHaveBeenCalledWith({ id: 'setup', context, waitSeconds: 25, signal });
  });
});
