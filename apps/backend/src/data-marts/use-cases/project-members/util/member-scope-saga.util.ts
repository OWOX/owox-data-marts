import { InternalServerErrorException, Logger } from '@nestjs/common';
import { ProjectRole } from '../../../enums/project-role.enum';
import { RoleScope } from '../../../enums/role-scope.enum';
import { ContextAccessService } from '../../../services/context/context-access.service';
import { ContextService } from '../../../services/context/context.service';

/**
 * Stable error message used when the IDP-side saga step succeeded but the
 * local scope/contexts write failed. The frontend toasts `err.message`
 * verbatim, so we keep this text short and actionable — admin reads it,
 * heads to the Members tab, and finishes the change manually.
 *
 * Exported so the frontend test suite (and any future i18n / sentry mapping
 * layer) can match against the literal.
 */
export const LOCAL_MEMBER_SCOPE_PARTIAL_FAILURE_MESSAGE =
  'The identity service accepted the change, but the role/contexts could not be applied locally. Open the Members tab and set them manually.';

/**
 * Shared scope-resolution + local-write helpers for the invite and approve
 * sagas. Both flows take `(role, roleScope?, contextIds)` from the caller,
 * infer a fallback scope, validate contextIds against the project, and then
 * write the local scope/contexts row after the IDP succeeds. The duplicated
 * try/catch + log shape used to live in both services — extracting it here
 * keeps the failure messaging consistent and makes the saga's invariants
 * (resolve → validate → IDP → write) visible in one place.
 */

/**
 * Resolve the effective `RoleScope` for an invite/approve action.
 *
 * - Admin role always coerces to `ENTIRE_PROJECT` (admins ignore context bindings).
 * - For non-admin roles: respect an explicit `requestedScope` if provided,
 *   otherwise infer from `contextIds` (non-empty → `SELECTED_CONTEXTS`,
 *   empty → `ENTIRE_PROJECT`) for backwards compatibility with the legacy
 *   invite shape.
 */
export function resolveEffectiveScope(
  role: ProjectRole,
  requestedScope: RoleScope | undefined,
  contextIds: string[]
): RoleScope {
  if (role === ProjectRole.ADMIN) return RoleScope.ENTIRE_PROJECT;
  if (requestedScope) return requestedScope;
  return contextIds.length > 0 ? RoleScope.SELECTED_CONTEXTS : RoleScope.ENTIRE_PROJECT;
}

/**
 * Validate context ids only when the caller actually passed some — cheap
 * shortcut so the use-cases stay readable.
 */
export async function validateContextIdsIfAny(
  contextService: ContextService,
  contextIds: string[],
  projectId: string
): Promise<void> {
  if (contextIds.length === 0) return;
  await contextService.validateContextIds(contextIds, projectId);
}

export interface ApplyLocalMemberScopeArgs {
  contextAccessService: ContextAccessService;
  logger: Logger;
  userId: string;
  projectId: string;
  role: ProjectRole;
  effectiveScope: RoleScope;
  contextIds: string[];
  /**
   * Operability-friendly label that identifies the originating saga step (e.g.
   * `"Approve accepted by IDP for request foo in project bar"`). The helper
   * appends a fixed suffix telling the operator the admin must recover via
   * `updateMember` — this matches the pre-existing error log shape.
   */
  failureLabel: string;
}

/**
 * Apply the local scope/contexts row after the IDP accepted the saga step.
 * On failure: log with the supplied label and rethrow — callers must NOT
 * swallow this, because the IDP has already mutated and silent fallbacks
 * previously promoted invitees to `entire_project` scope.
 */
export async function applyLocalMemberScope(args: ApplyLocalMemberScopeArgs): Promise<void> {
  const {
    contextAccessService,
    logger,
    userId,
    projectId,
    role,
    effectiveScope,
    contextIds,
    failureLabel,
  } = args;

  try {
    await contextAccessService.updateMember(userId, projectId, {
      role,
      roleScope: effectiveScope,
      contextIds,
    });
  } catch (err) {
    // Operator log keeps the full stack and the originating saga step so
    // postmortems can trace which approve/invite call left half-state behind.
    logger.error(
      `${failureLabel}, but local scope/contexts write failed; admin must retry via updateMember.`,
      err instanceof Error ? err.stack : String(err)
    );
    // Client error is rewritten with an actionable message — the IDP side of
    // the saga has already committed, so a generic 5xx tells the admin the
    // wrong story ("retry") when reality is "the user is approved/invited,
    // just no scope yet". The original error is preserved via `cause` for
    // anyone walking the chain in logs.
    throw new InternalServerErrorException(LOCAL_MEMBER_SCOPE_PARTIAL_FAILURE_MESSAGE, {
      cause: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

/**
 * Read back the persisted scope/contexts for the affected user. Used by
 * approve/update flows so the API response reflects DB state (not the input
 * the admin requested) — admins picking `admin` + contextIds, for example,
 * see the actual `entire_project` + `[]` shape that was stored.
 */
export async function readPersistedMemberScope(
  contextAccessService: ContextAccessService,
  userId: string,
  projectId: string
): Promise<{ roleScope: RoleScope; contextIds: string[] }> {
  const [roleScope, contextIds] = await Promise.all([
    contextAccessService.getRoleScope(userId, projectId),
    contextAccessService.getMemberContextIds(userId, projectId),
  ]);
  return { roleScope, contextIds };
}
