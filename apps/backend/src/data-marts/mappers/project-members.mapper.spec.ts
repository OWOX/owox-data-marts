import { ProjectMembersMapper } from './project-members.mapper';
import { ProjectRole } from '../enums/project-role.enum';
import { RoleScope } from '../enums/role-scope.enum';
import type { ProjectMemberWithScope } from '../use-cases/project-members/list-project-members.service';

describe('ProjectMembersMapper', () => {
  const mapper = new ProjectMembersMapper();

  const makeMember = (overrides: Partial<ProjectMemberWithScope> = {}): ProjectMemberWithScope => ({
    userId: 'user-1',
    email: 'user-1@owox.io',
    displayName: 'User One',
    avatarUrl: 'https://cdn/avatar/u1.png',
    role: ProjectRole.EDITOR,
    roleScope: RoleScope.SELECTED_CONTEXTS,
    contextIds: ['ctx-1', 'ctx-2'],
    ...overrides,
  });

  describe('toApiResponse', () => {
    it('passes every field through verbatim', () => {
      const member = makeMember();
      const dto = mapper.toApiResponse(member);

      expect(dto).toEqual({
        userId: 'user-1',
        email: 'user-1@owox.io',
        displayName: 'User One',
        avatarUrl: 'https://cdn/avatar/u1.png',
        role: ProjectRole.EDITOR,
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1', 'ctx-2'],
      });
    });

    it('preserves optional fields when undefined', () => {
      const member = makeMember({ displayName: undefined, avatarUrl: undefined });
      const dto = mapper.toApiResponse(member);

      expect(dto.displayName).toBeUndefined();
      expect(dto.avatarUrl).toBeUndefined();
      expect(dto.userId).toBe(member.userId);
    });

    it('does not deep-copy contextIds (presentation DTO is read-only by convention)', () => {
      // The mapper hands the same reference through; callers must not mutate
      // the input. This pins the convention so a future "defensive copy" PR
      // is a deliberate decision, not a regression.
      const member = makeMember();
      const dto = mapper.toApiResponse(member);
      expect(dto.contextIds).toBe(member.contextIds);
    });
  });

  describe('toApiResponseList', () => {
    it('maps every entry with toApiResponse', () => {
      const members = [
        makeMember({ userId: 'u1', email: 'u1@x.io' }),
        makeMember({
          userId: 'u2',
          email: 'u2@x.io',
          role: ProjectRole.ADMIN,
          roleScope: RoleScope.ENTIRE_PROJECT,
          contextIds: [],
        }),
      ];

      const dtos = mapper.toApiResponseList(members);

      expect(dtos).toHaveLength(2);
      expect(dtos[0].userId).toBe('u1');
      expect(dtos[1].role).toBe(ProjectRole.ADMIN);
      expect(dtos[1].roleScope).toBe(RoleScope.ENTIRE_PROJECT);
      expect(dtos[1].contextIds).toEqual([]);
    });

    it('returns an empty array for an empty list', () => {
      expect(mapper.toApiResponseList([])).toEqual([]);
    });
  });
});
