import { describe, expect, it } from 'vitest';
import type { ContextDto, MemberWithScopeDto } from '../../types/context.types';
import { buildContextsTableItems } from './buildContextsTableItems';

const context = (id: string): ContextDto => ({
  id,
  name: id,
  description: null,
  icon: null,
  createdById: null,
  createdByUser: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-01T00:00:00.000Z',
});

const member = (
  userId: string,
  role: MemberWithScopeDto['role'],
  roleScope: MemberWithScopeDto['roleScope'],
  contextIds: string[]
): MemberWithScopeDto => ({
  userId,
  email: `${userId}@example.test`,
  displayName: userId,
  avatarUrl: undefined,
  role,
  roleScope,
  contextIds,
});

const memberIds = (items: ReturnType<typeof buildContextsTableItems>, contextId: string) =>
  items.find(item => item.id === contextId)?.memberUsers.map(u => u.userId);

describe('buildContextsTableItems', () => {
  it('lists admins and Entire project members on every context, ignoring their kept assignments', () => {
    const items = buildContextsTableItems(
      [context('engineering'), context('marketing')],
      [
        member('admin', 'admin', 'selected_contexts', ['engineering']),
        member('project-wide', 'editor', 'entire_project', ['engineering']),
        member('scoped', 'viewer', 'selected_contexts', ['marketing']),
      ]
    );

    expect(memberIds(items, 'engineering')).toEqual(['admin', 'project-wide']);
    expect(memberIds(items, 'marketing')).toEqual(['admin', 'project-wide', 'scoped']);
    expect(items.find(item => item.id === 'marketing')?.memberCount).toBe(3);
  });
});
