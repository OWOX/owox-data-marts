import { ConflictException, NotFoundException } from '@nestjs/common';
import { McpContextsFacadeImpl } from './mcp-contexts.facade.impl';
import type { ContextService } from '../services/context/context.service';
import { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';
import { SetContextMembersService } from '../use-cases/contexts/set-context-members.service';
import { CreateContextService } from '../use-cases/contexts/create-context.service';
import { UpdateContextMetadataService } from '../use-cases/contexts/update-context-metadata.service';
import { GetContextImpactService } from '../use-cases/contexts/get-context-impact.service';
import { DeleteContextService } from '../use-cases/contexts/delete-context.service';
import { ListContextsService } from '../use-cases/contexts/list-contexts.service';
import { ValidateContextIdsService } from '../use-cases/contexts/validate-context-ids.service';
import { GetDataMartContextsService } from '../use-cases/contexts/get-data-mart-contexts.service';
import { ContextMapper } from '../mappers/context.mapper';

describe('McpContextsFacadeImpl', () => {
  const service = {
    list: jest.fn(),
    validateContextIds: jest.fn(),
    getDataMartContextSummaries: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    getImpact: jest.fn(),
    delete: jest.fn(),
  };
  const members = { getProjectMembersOrThrow: jest.fn(), setContextMembers: jest.fn() };
  const domain = service as unknown as ContextService;
  const facade = new McpContextsFacadeImpl(
    new CreateContextService(domain),
    new UpdateContextMetadataService(domain),
    new GetContextImpactService(domain, members as never),
    new DeleteContextService(domain, members as never),
    new SetContextMembersService(members as never, members as never),
    new ListContextsService(domain),
    new ValidateContextIdsService(domain),
    new GetDataMartContextsService(domain),
    new ContextMapper()
  );
  const ctx = { projectId: 'project', userId: 'admin-user' };

  beforeEach(() => {
    jest.resetAllMocks();
  });
  it('returns Contexts and Data Mart Context summaries for the requested project', async () => {
    const description = '# Marketing\n' + 'long goal '.repeat(2000);
    service.list.mockResolvedValue([
      { id: 'c', name: 'Marketing', description, icon: 'lucide:megaphone' },
      { id: 'builtin', name: 'Purchases', description: null, icon: 'purchases' },
      { id: 'empty', name: 'Empty', description: null, icon: null },
    ]);
    expect(await facade.listContexts(ctx.projectId)).toEqual([
      { id: 'c', name: 'Marketing', description, icon: 'lucide:megaphone' },
      { id: 'builtin', name: 'Purchases', description: null, icon: 'purchases' },
      { id: 'empty', name: 'Empty', description: null, icon: null },
    ]);
    expect(service.list).toHaveBeenCalledWith('project');
    service.getDataMartContextSummaries.mockResolvedValue({ dm: [{ id: 'c', name: 'Marketing' }] });
    expect(await facade.getDataMartContexts(ctx.projectId, ['dm'])).toEqual({
      dm: [{ id: 'c', name: 'Marketing' }],
    });
    expect(service.getDataMartContextSummaries).toHaveBeenCalledWith('project', ['dm']);
  });
  it('deduplicates IDs before project validation and propagates failures', async () => {
    await facade.validateContextIds(ctx.projectId, ['c', 'c']);
    expect(service.validateContextIds).toHaveBeenCalledWith(['c'], 'project');
    service.validateContextIds.mockRejectedValueOnce(new Error('foreign project'));
    await expect(facade.validateContextIds(ctx.projectId, ['foreign'])).rejects.toThrow(
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

      expect(service.create).toHaveBeenCalledWith('project', 'admin-user', 'Marketing', null, null);
    });

    it.each([undefined, null, '', 'Revenue goals'])(
      'preserves omitted, empty and null descriptions in update commands: %p',
      async description => {
        service.update.mockResolvedValue(dto);

        await expect(
          facade.updateContextMetadata(ctx, {
            contextId: 'context',
            name: 'Marketing',
            description,
          })
        ).resolves.toBe(dto);

        expect(service.update).toHaveBeenCalledWith(
          'context',
          'project',
          'Marketing',
          description,
          undefined
        );
      }
    );

    it('returns the project-scoped impact DTO', async () => {
      const impact = new ContextImpactDto('context', 'Marketing', 1, 2, 3, 4, 5, ['member']);
      members.getProjectMembersOrThrow.mockResolvedValue([
        { userId: 'admin-user', role: 'admin', isOutbound: false },
        { userId: 'member', role: 'editor', isOutbound: false },
      ]);
      service.getImpact.mockResolvedValue(impact);

      await expect(facade.getContextImpact(ctx, { contextId: 'context' })).resolves.toBe(impact);
      expect(service.getImpact).toHaveBeenCalledWith('context', 'project', new Set(['member']));
    });

    it('propagates the conflict when deleting an attached Context', async () => {
      const conflict = new ConflictException({ message: 'Detach first', dataMartCount: 1 });
      members.getProjectMembersOrThrow.mockResolvedValue([
        { userId: 'member', role: 'viewer', isOutbound: false },
      ]);
      service.delete.mockRejectedValueOnce(conflict);

      await expect(facade.deleteContext(ctx, { contextId: 'context' })).rejects.toBe(conflict);
      expect(service.delete).toHaveBeenCalledWith('context', 'project', new Set(['member']));

      await expect(facade.deleteContext(ctx, { contextId: 'context' })).resolves.toBeUndefined();
    });

    it('keeps the member use case result including dropped admin IDs', async () => {
      members.getProjectMembersOrThrow.mockResolvedValue([
        { userId: 'member', role: 'viewer' },
        { userId: 'admin', role: 'admin' },
      ]);

      await expect(
        facade.setContextMembers(ctx, {
          contextId: 'context',
          assignedUserIds: ['member', 'admin'],
        })
      ).resolves.toEqual({ assignedUserIds: ['member'], droppedAdminIds: ['admin'] });
      expect(members.setContextMembers).toHaveBeenCalledWith('context', 'project', ['member']);
    });

    it('propagates the service rejection for a Context outside the current project', async () => {
      const error = new NotFoundException('Context does not belong to project');
      service.update.mockRejectedValue(error);

      await expect(
        facade.updateContextMetadata(ctx, { contextId: 'foreign', name: 'Marketing' })
      ).rejects.toBe(error);
      expect(service.update).toHaveBeenCalledWith(
        'foreign',
        'project',
        'Marketing',
        undefined,
        undefined
      );
    });

    it('passes a Context icon on create and preserves omitted metadata on icon-only updates', async () => {
      service.create.mockResolvedValue(dto);
      service.update.mockResolvedValue(dto);
      await facade.createContext(ctx, { name: 'Marketing', icon: 'lucide:megaphone' });
      expect(service.create).toHaveBeenCalledWith(
        'project',
        'admin-user',
        'Marketing',
        undefined,
        'lucide:megaphone'
      );
      await facade.updateContextMetadata(ctx, { contextId: 'context', icon: null });
      expect(service.update).toHaveBeenCalledWith('context', 'project', undefined, undefined, null);
    });
  });
});
