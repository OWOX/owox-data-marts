import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { McpContextsFacadeImpl } from './mcp-contexts.facade.impl';
import type { ContextService } from '../services/context/context.service';
import { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';
import type { SetContextMembersService } from '../use-cases/contexts/set-context-members.service';

describe('McpContextsFacadeImpl', () => {
  const service = {
    listForMcp: jest.fn(),
    validateContextIds: jest.fn(),
    getDataMartContextSummaries: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    getImpact: jest.fn(),
    delete: jest.fn(),
  };
  const members = { run: jest.fn() };
  const facade = new McpContextsFacadeImpl(
    service as unknown as ContextService,
    members as unknown as SetContextMembersService
  );
  const ctx = { projectId: 'project', userId: 'admin-user', roles: ['admin'] };

  beforeEach(() => jest.resetAllMocks());
  it('delegates reads to project-scoped services without provisioning or mutations', async () => {
    const description = '# Marketing\n' + 'long goal '.repeat(2000);
    service.listForMcp.mockResolvedValue([
      { id: 'c', name: 'Marketing', description },
      { id: 'empty', name: 'Empty', description: null },
    ]);
    expect(await facade.listContexts('project')).toEqual([
      { id: 'c', name: 'Marketing', description },
      { id: 'empty', name: 'Empty', description: null },
    ]);
    expect(service.listForMcp).toHaveBeenCalledWith('project');
    service.getDataMartContextSummaries.mockResolvedValue({ dm: [{ id: 'c', name: 'Marketing' }] });
    expect(await facade.getDataMartContexts('project', ['dm'])).toEqual({
      dm: [{ id: 'c', name: 'Marketing' }],
    });
    expect(service.getDataMartContextSummaries).toHaveBeenCalledWith('project', ['dm']);
  });
  it('deduplicates IDs before project validation and propagates failures', async () => {
    await facade.validateContextIds('project', ['c', 'c']);
    expect(service.validateContextIds).toHaveBeenCalledWith(['c'], 'project');
    service.validateContextIds.mockRejectedValueOnce(new Error('foreign project'));
    await expect(facade.validateContextIds('project', ['foreign'])).rejects.toThrow(
      'foreign project'
    );
  });

  describe('Context configuration', () => {
    const dto = new ContextDto(
      'context',
      'Marketing',
      null,
      'project',
      'admin-user',
      null,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-02T00:00:00.000Z')
    );

    it('creates a Context with the authenticated actor and project', async () => {
      service.create.mockResolvedValue(dto);

      await expect(
        facade.createContext(ctx, { name: 'Marketing', description: null })
      ).resolves.toBe(dto);

      expect(service.create).toHaveBeenCalledWith('project', 'admin-user', 'Marketing', null);
    });

    it.each([undefined, null, '', 'Revenue goals'])(
      'preserves an update description of %p for the existing service',
      async description => {
        service.update.mockResolvedValue(dto);

        await expect(
          facade.updateContext(ctx, { contextId: 'context', name: 'Marketing', description })
        ).resolves.toBe(dto);

        expect(service.update).toHaveBeenCalledWith('context', 'project', 'Marketing', description);
      }
    );

    it('returns the project-scoped impact DTO', async () => {
      const impact = new ContextImpactDto('context', 'Marketing', 1, 2, 3, 4, 5, ['member']);
      service.getImpact.mockResolvedValue(impact);

      await expect(facade.getContextImpact(ctx, { contextId: 'context' })).resolves.toBe(impact);
      expect(service.getImpact).toHaveBeenCalledWith('context', 'project');
    });

    it('delegates deletion to the existing detachment check and preserves its conflict', async () => {
      const conflict = new ConflictException({ message: 'Detach first', dataMartCount: 1 });
      service.delete.mockRejectedValueOnce(conflict);

      await expect(facade.deleteContext(ctx, { contextId: 'context' })).rejects.toBe(conflict);
      expect(service.delete).toHaveBeenCalledWith('context', 'project');

      await expect(facade.deleteContext(ctx, { contextId: 'context' })).resolves.toBeUndefined();
    });

    it('keeps the member use case result including dropped admin IDs', async () => {
      members.run.mockResolvedValue({ assignedUserIds: ['member'], droppedAdminIds: ['admin'] });

      await expect(
        facade.setContextMembers(ctx, {
          contextId: 'context',
          assignedUserIds: ['member', 'admin'],
        })
      ).resolves.toEqual({ assignedUserIds: ['member'], droppedAdminIds: ['admin'] });
      expect(members.run).toHaveBeenCalledWith('context', 'project', ['member', 'admin']);
    });

    it.each([
      { projectId: 'project', userId: 'actor', roles: ['viewer'] },
      { projectId: 'project', userId: 'actor', roles: ['editor'] },
      { projectId: 'project', userId: 'actor', roles: [] },
      { projectId: 'project', userId: 'actor', roles: ['owner'] },
      { projectId: 'project', userId: '', roles: ['admin'] },
      { projectId: 'project', userId: '  ', roles: ['admin'] },
      { projectId: '', userId: 'actor', roles: ['admin'] },
    ])('blocks all admin-only operations for %p before touching services', async deniedCtx => {
      const operations = [
        () => facade.createContext(deniedCtx, { name: 'Marketing' }),
        () => facade.updateContext(deniedCtx, { contextId: 'context', name: 'Marketing' }),
        () => facade.getContextImpact(deniedCtx, { contextId: 'context' }),
        () => facade.deleteContext(deniedCtx, { contextId: 'context' }),
        () => facade.setContextMembers(deniedCtx, { contextId: 'context', assignedUserIds: [] }),
      ];

      for (const operation of operations) {
        await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(service.create).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
      expect(service.getImpact).not.toHaveBeenCalled();
      expect(service.delete).not.toHaveBeenCalled();
      expect(members.run).not.toHaveBeenCalled();
    });

    it('propagates the service rejection for a Context outside the current project', async () => {
      const error = new NotFoundException('Context does not belong to project');
      service.update.mockRejectedValue(error);

      await expect(
        facade.updateContext(ctx, { contextId: 'foreign', name: 'Marketing' })
      ).rejects.toBe(error);
      expect(service.update).toHaveBeenCalledWith('foreign', 'project', 'Marketing', undefined);
    });
  });
});
