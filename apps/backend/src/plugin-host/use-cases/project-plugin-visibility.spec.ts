import type { AuthorizationContext } from '../../idp/types/auth.types';
import { isProjectAdmin, isVisibleTo } from './project-plugin-visibility';

const ADMIN = { projectId: 'project-1', userId: 'admin', roles: ['admin'] } as AuthorizationContext;
const ALICE = {
  projectId: 'project-1',
  userId: 'alice',
  roles: ['editor'],
} as AuthorizationContext;

describe('project plugin visibility', () => {
  it('reads an admin from the roles, and no roles as no admin', () => {
    expect(isProjectAdmin(ADMIN)).toBe(true);
    expect(isProjectAdmin(ALICE)).toBe(false);
    expect(isProjectAdmin({ projectId: 'project-1', userId: 'bob' })).toBe(false);
  });

  it.each([
    ["an admin, another member's row", ADMIN, { projectId: 'project-1', userId: 'bob' }, true],
    ['the owner, their own row', ALICE, { projectId: 'project-1', userId: 'alice' }, true],
    ["a member, another member's row", ALICE, { projectId: 'project-1', userId: 'bob' }, false],
    ["an admin, another project's row", ADMIN, { projectId: 'project-2', userId: 'admin' }, false],
    [
      'the owner, their row in another project',
      ALICE,
      { projectId: 'project-2', userId: 'alice' },
      false,
    ],
  ])('%s', (_case, context, row, visible) => {
    expect(isVisibleTo(context, row)).toBe(visible);
  });
});
