import type { AuthorizationContext } from '../../idp/types/auth.types';

export function isProjectAdmin(context: AuthorizationContext): boolean {
  return (context.roles ?? []).includes('admin');
}

export function isVisibleTo(
  context: AuthorizationContext,
  row: { readonly projectId: string; readonly userId: string }
): boolean {
  return (
    row.projectId === context.projectId &&
    (isProjectAdmin(context) || row.userId === context.userId)
  );
}
