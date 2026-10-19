jest.mock('../services/data-mart.service', () => ({ DataMartService: jest.fn() }));
import { McpContextSetupFacadeImpl } from './mcp-context-setup.facade.impl';
import type { ContextSetupActor } from '../dto/domain/mcp-context-setup.dto';

describe('McpContextSetupFacadeImpl', () => {
  const actor: ContextSetupActor = { projectId: 'project', userId: 'actor', roles: ['admin'] };
  it('passes mandatory actor and parameters intact to every domain reader and preserves failures', async () => {
    const methods = [
      'getContext',
      'listResources',
      'listMembers',
      'getDefaults',
      'getImpact',
    ] as const;
    const reader = Object.fromEntries(
      methods.map(method => [method, jest.fn().mockResolvedValue({ result: method })])
    );
    const facade = new McpContextSetupFacadeImpl(
      reader as never,
      {
        authorize: jest.fn().mockImplementation(async actor => actor),
        impact: jest.fn().mockResolvedValue({
          revision: 1,
          impactDigest: 'digest',
          effects: {
            blockers: {
              dataMartCount: 0,
              storageCount: 0,
              destinationCount: 0,
              credentialCount: 0,
              memberCount: 0,
              userProvisioningDefaultsCount: 0,
            },
            affectedMemberIds: [],
          },
        }),
      } as never
    );
    const requests: [(typeof methods)[number], unknown[]][] = [
      ['getContext', [actor, 'context']],
      ['listResources', [actor, { limit: 10, offset: 0 }]],
      ['listMembers', [actor, { query: 'name', limit: 10, offset: 0 }]],
      ['getDefaults', [actor]],
      ['getImpact', [actor, 'context']],
    ];
    for (const [method, args] of requests) {
      await expect(
        (facade[method] as (...args: unknown[]) => Promise<unknown>)(...args)
      ).resolves.toMatchObject({ result: method });
      expect(reader[method]).toHaveBeenCalledWith(...args);
      reader[method].mockRejectedValue(new Error('stored read failed'));
      await expect(
        (facade[method] as (...args: unknown[]) => Promise<unknown>)(...args)
      ).rejects.toThrow('stored read failed');
    }
  });
  it('delegates typed mutations and impact without swallowing domain failures', async () => {
    const writer = {
      run: jest.fn().mockResolvedValue({ resourceId: 'context', revision: 1, state: 'completed' }),
      impact: jest.fn().mockResolvedValue({ impactDigest: 'digest' }),
    };
    const facade = new McpContextSetupFacadeImpl({} as never, writer as never);
    const command = {
      action: 'create_context' as const,
      name: 'Marketing',
      operationId: 'operation',
    };
    const change = { action: 'delete_context' as const, contextId: 'context' };
    await expect(facade.mutate(actor, command)).resolves.toMatchObject({ resourceId: 'context' });
    expect(writer.run).toHaveBeenCalledWith(actor, command);
    await expect(facade.getChangeImpact(actor, change)).resolves.toEqual({
      impactDigest: 'digest',
    });
    expect(writer.impact).toHaveBeenCalledWith(actor, change);
    writer.run.mockRejectedValue(new Error('domain conflict'));
    await expect(facade.mutate(actor, command)).rejects.toThrow('domain conflict');
  });
});
