import type { UserProjection } from '../../../../shared/types';
import type { ContextDto, MemberWithScopeDto } from '../../types/context.types';
import type { ContextsTableItem } from './columns';

const toProjection = (m: MemberWithScopeDto): UserProjection => ({
  userId: m.userId,
  fullName: m.displayName ?? null,
  email: m.email,
  avatar: m.avatarUrl ?? null,
});

/**
 * Lists the members of each context. Admins and Entire project members see
 * every context, so they appear on all of them, as in the context sheet.
 * Selected contexts members appear on the contexts assigned to them. An Entire
 * project member's assignments kept from an earlier scope are ignored, as in
 * Members.
 */
export function buildContextsTableItems(
  contexts: ContextDto[],
  members: MemberWithScopeDto[]
): ContextsTableItem[] {
  const isAdmin = (m: MemberWithScopeDto) => m.role === 'admin';
  const isProjectWide = (m: MemberWithScopeDto) => !isAdmin(m) && m.roleScope === 'entire_project';
  const allContextsMembers = [...members.filter(isAdmin), ...members.filter(isProjectWide)].map(
    toProjection
  );

  const scopedByContext = new Map<string, UserProjection[]>();
  for (const m of members) {
    if (isAdmin(m) || isProjectWide(m)) continue;
    const projection = toProjection(m);
    for (const cid of m.contextIds) {
      const bucket = scopedByContext.get(cid);
      if (bucket) {
        bucket.push(projection);
      } else {
        scopedByContext.set(cid, [projection]);
      }
    }
  }

  return contexts.map(c => {
    const scoped = scopedByContext.get(c.id) ?? [];
    const seen = new Set<string>();
    const memberUsers: UserProjection[] = [];
    for (const u of [...allContextsMembers, ...scoped]) {
      if (seen.has(u.userId)) continue;
      seen.add(u.userId);
      memberUsers.push(u);
    }
    return { ...c, memberCount: memberUsers.length, memberUsers };
  });
}
