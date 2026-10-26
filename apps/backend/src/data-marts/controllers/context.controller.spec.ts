jest.mock('../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    Role: { admin: () => 'admin', editor: () => 'editor', viewer: () => 'viewer' },
    Strategy: { INTROSPECT: 'INTROSPECT', PARSE: 'PARSE' },
  };
});

import { ContextController } from './context.controller';
import { ContextMapper } from '../mappers/context.mapper';
import { CreateContextCommand } from '../dto/domain/create-context.command';
import { UpdateContextMetadataCommand } from '../dto/domain/update-context-metadata.command';
import { GetContextImpactCommand } from '../dto/domain/get-context-impact.command';
import { DeleteContextCommand } from '../dto/domain/delete-context.command';
import { ListContextsCommand } from '../dto/domain/list-contexts.command';
import { SetContextMembersCommand } from '../dto/domain/set-context-members.command';

import type { AuthorizationContext } from '../../idp/types/auth.types';
import { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';

describe('ContextController', () => {
  const PROJECT_ID = 'project-1';
  const USER_ID = 'user-1';
  const CONTEXT_ID = 'ctx-1';

  const makeAuthContext = (overrides: Partial<AuthorizationContext> = {}): AuthorizationContext =>
    ({
      projectId: PROJECT_ID,
      userId: USER_ID,
      roles: ['admin'],
      ...overrides,
    }) as AuthorizationContext;

  const createController = () => {
    const useCases = {
      create: { run: jest.fn() },
      list: { run: jest.fn() },
      update: { run: jest.fn() },
      getImpact: { run: jest.fn() },
      delete: { run: jest.fn() },
    };
    const contextMapper = new ContextMapper();

    const setContextMembersService = {
      run: jest.fn().mockResolvedValue({ assignedUserIds: [], droppedAdminIds: [] }),
    };

    const controller = new ContextController(
      useCases.create as never,
      useCases.update as never,
      useCases.getImpact as never,
      useCases.delete as never,
      useCases.list as never,
      contextMapper,
      setContextMembersService as never
    );

    return {
      controller,
      useCases,
      setContextMembersService,
    };
  };

  const sampleContextDto = new ContextDto(
    CONTEXT_ID,
    'Marketing',
    'Marketing ctx',
    PROJECT_ID,
    USER_ID,
    null,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z')
  );

  describe('create', () => {
    it('creates context and maps to response', async () => {
      const { controller, useCases } = createController();
      useCases.create.run.mockResolvedValue(sampleContextDto);

      const result = await controller.create(makeAuthContext(), {
        name: 'Marketing',
        description: 'Marketing ctx',
      });

      expect(useCases.create.run).toHaveBeenCalledWith(
        new CreateContextCommand(PROJECT_ID, USER_ID, 'Marketing', 'Marketing ctx', undefined)
      );
      expect(result).toEqual({
        id: CONTEXT_ID,
        name: sampleContextDto.name,
        description: sampleContextDto.description,
        icon: null,
        createdById: USER_ID,
        createdByUser: null,
        createdAt: sampleContextDto.createdAt,
        modifiedAt: sampleContextDto.modifiedAt,
      });
    });

    it('passes the picked icon on create', async () => {
      const { controller, useCases } = createController();
      useCases.create.run.mockResolvedValue(sampleContextDto);

      await controller.create(makeAuthContext(), { name: 'Marketing', icon: 'lucide:megaphone' });

      expect(useCases.create.run).toHaveBeenCalledWith(
        new CreateContextCommand(PROJECT_ID, USER_ID, 'Marketing', undefined, 'lucide:megaphone')
      );
    });
  });

  describe('updateIcon', () => {
    it('updates the icon in the caller project and maps to response', async () => {
      const { controller, useCases } = createController();
      const withIcon = new ContextDto(
        CONTEXT_ID,
        'Marketing',
        'Marketing ctx',
        PROJECT_ID,
        USER_ID,
        null,
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        'lucide:megaphone'
      );
      useCases.update.run.mockResolvedValue(withIcon);

      const result = await controller.updateIcon(makeAuthContext(), CONTEXT_ID, {
        icon: 'lucide:megaphone',
      });

      expect(useCases.update.run).toHaveBeenCalledWith(
        new UpdateContextMetadataCommand(
          CONTEXT_ID,
          PROJECT_ID,
          undefined,
          undefined,
          'lucide:megaphone'
        )
      );
      expect(result.icon).toBe('lucide:megaphone');
    });

    it('passes null through as a reset', async () => {
      const { controller, useCases } = createController();
      useCases.update.run.mockResolvedValue(sampleContextDto);

      await controller.updateIcon(makeAuthContext(), CONTEXT_ID, { icon: null });

      expect(useCases.update.run).toHaveBeenCalledWith(
        new UpdateContextMetadataCommand(CONTEXT_ID, PROJECT_ID, undefined, undefined, null)
      );
    });
  });

  describe('list', () => {
    it('lists all contexts for project', async () => {
      const { controller, useCases } = createController();
      useCases.list.run.mockResolvedValue([sampleContextDto, sampleContextDto]);

      const result = await controller.list(makeAuthContext());

      expect(useCases.list.run).toHaveBeenCalledWith(new ListContextsCommand(PROJECT_ID));
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: CONTEXT_ID, icon: null })])
      );
    });

    it('returns empty list when no contexts', async () => {
      const { controller, useCases } = createController();
      useCases.list.run.mockResolvedValue([]);

      const result = await controller.list(makeAuthContext());

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates context and maps to response', async () => {
      const { controller, useCases } = createController();
      useCases.update.run.mockResolvedValue(sampleContextDto);

      const result = await controller.update(makeAuthContext(), CONTEXT_ID, {
        name: 'Marketing 2',
        description: 'Updated',
      });

      expect(useCases.update.run).toHaveBeenCalledWith(
        new UpdateContextMetadataCommand(
          CONTEXT_ID,
          PROJECT_ID,
          'Marketing 2',
          'Updated',
          undefined
        )
      );
      expect(result).toEqual({
        id: CONTEXT_ID,
        name: sampleContextDto.name,
        description: sampleContextDto.description,
        icon: null,
        createdById: USER_ID,
        createdByUser: null,
        createdAt: sampleContextDto.createdAt,
        modifiedAt: sampleContextDto.modifiedAt,
      });
    });

    it('passes an icon sent with the update, null included', async () => {
      const { controller, useCases } = createController();
      useCases.update.run.mockResolvedValue(sampleContextDto);

      await controller.update(makeAuthContext(), CONTEXT_ID, {
        name: 'Marketing',
        icon: 'lucide:megaphone',
      });
      await controller.update(makeAuthContext(), CONTEXT_ID, { name: 'Marketing', icon: null });

      expect(useCases.update.run).toHaveBeenNthCalledWith(
        1,
        new UpdateContextMetadataCommand(
          CONTEXT_ID,
          PROJECT_ID,
          'Marketing',
          undefined,
          'lucide:megaphone'
        )
      );
      expect(useCases.update.run).toHaveBeenNthCalledWith(
        2,
        new UpdateContextMetadataCommand(CONTEXT_ID, PROJECT_ID, 'Marketing', undefined, null)
      );
    });
  });

  describe('getImpact', () => {
    it('returns full impact dto', async () => {
      const { controller, useCases } = createController();
      const impact = new ContextImpactDto(CONTEXT_ID, 'Marketing', 2, 1, 0, 3, 1, ['u1', 'u2']);
      useCases.getImpact.run.mockResolvedValue(impact);

      const result = await controller.getImpact(makeAuthContext(), CONTEXT_ID);

      expect(useCases.getImpact.run).toHaveBeenCalledWith(
        new GetContextImpactCommand(CONTEXT_ID, PROJECT_ID)
      );
      expect(result).toEqual(impact);
    });
  });

  describe('delete', () => {
    it('deletes within the authenticated project and returns no body', async () => {
      const { controller, useCases } = createController();
      useCases.delete.run.mockResolvedValue(undefined);

      await expect(controller.delete(makeAuthContext(), CONTEXT_ID)).resolves.toBeUndefined();

      expect(useCases.delete.run).toHaveBeenCalledWith(
        new DeleteContextCommand(CONTEXT_ID, PROJECT_ID)
      );
    });
  });

  describe('setContextMembers', () => {
    it('forwards the request to SetContextMembersService and returns the result', async () => {
      const { controller, setContextMembersService } = createController();
      setContextMembersService.run.mockResolvedValue({
        assignedUserIds: ['1', '2'],
        droppedAdminIds: ['0'],
      });

      const result = await controller.setContextMembers(makeAuthContext(), CONTEXT_ID, {
        assignedUserIds: ['0', '1', '2'],
      });

      expect(setContextMembersService.run).toHaveBeenCalledWith(
        new SetContextMembersCommand(CONTEXT_ID, PROJECT_ID, ['0', '1', '2'])
      );
      expect(result.assignedUserIds).toEqual(['1', '2']);
      expect(result.droppedAdminIds).toEqual(['0']);
    });

    it('propagates service errors', async () => {
      const { controller, setContextMembersService } = createController();
      setContextMembersService.run.mockRejectedValue(new Error('invalid context'));

      await expect(
        controller.setContextMembers(makeAuthContext(), CONTEXT_ID, {
          assignedUserIds: ['1'],
        })
      ).rejects.toThrow('invalid context');
    });
  });
});
