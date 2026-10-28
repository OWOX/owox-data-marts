import type { IdpProjectionsFacade } from '../../../../idp/facades/idp-projections.facade';

/**
 * Current project members other than admins: the only members whose access a
 * context can limit. Uses the strict lookup, because an empty list after an IdP
 * failure would make every member assignment look non-blocking.
 */
export async function getNonAdminMemberIds(
  idpProjectionsFacade: IdpProjectionsFacade,
  projectId: string
): Promise<Set<string>> {
  const members = await idpProjectionsFacade.getProjectMembersOrThrow(projectId);
  return new Set(
    members.filter(member => !member.isOutbound && member.role !== 'admin').map(m => m.userId)
  );
}
