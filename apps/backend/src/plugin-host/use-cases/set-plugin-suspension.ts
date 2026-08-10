import { AuthorizationContext } from '../../idp/types/auth.types';
import { PluginSuspensionDto } from '../dto/domain/suspend-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import {
  PluginNotPublishedError,
  PublicationAuthorizationError,
} from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { parseGithubRepoLocator } from '../utils/github-repo-locator.util';

export interface SetPluginSuspensionDeps {
  readonly authorization: PublicationAuthorizationService;
  readonly pluginService: PluginService;
  readonly audit: PluginAuditService;
}

export interface SetPluginSuspensionInput {
  readonly repoLocator: string;
  readonly context: AuthorizationContext;
  readonly note?: string;
  readonly suspended: boolean;
}

/**
 * Shared body of suspend / resume. Both directions stay soft and idempotent; only the
 * flag and audit action change.
 */
export async function setPluginSuspension(
  deps: SetPluginSuspensionDeps,
  input: SetPluginSuspensionInput
): Promise<PluginSuspensionDto> {
  if (!deps.authorization.isDeploymentPublisher(input.context)) {
    throw new PublicationAuthorizationError(
      PluginPublicationScope.DEPLOYMENT,
      'Suspending and resuming plugins is limited to allowlisted publisher API keys'
    );
  }

  const ref = parseGithubRepoLocator(input.repoLocator);
  // Cached lookup, no GitHub call: an emergency control that stops working when the
  // upstream is unreachable is not an emergency control.
  const plugin = await deps.pluginService.findByRepoName(ref.owner, ref.name);
  if (!plugin) {
    throw new PluginNotPublishedError(PluginPublicationScope.DEPLOYMENT);
  }

  const wasSuspended = plugin.suspendedAt !== null;
  const note = input.note ?? null;

  // Repeating either direction is a no-op on state. Re-stamping suspendedAt would
  // rewrite when the incident actually began.
  if (wasSuspended !== input.suspended) {
    await deps.pluginService.setSuspension(
      plugin.id,
      input.suspended ? new Date() : null,
      // The column means "who suspended this". On resume there is no suspender, so
      // passing the resuming key would store data that reads as the opposite of the
      // truth. Who resumed it lives in the audit entry below.
      input.suspended ? (input.context.apiKeyId ?? null) : null,
      note
    );
  }

  // Audited on every call, including no-ops: knowing an operator pressed the button
  // twice is part of the incident record.
  await deps.audit.record({
    pluginId: plugin.id,
    action: input.suspended ? PluginAuditAction.SUSPEND : PluginAuditAction.RESUME,
    authorityScope: PluginPublicationScope.DEPLOYMENT,
    projectId: input.context.projectId,
    userId: input.context.userId,
    apiKeyId: input.context.apiKeyId ?? null,
    beforeState: { suspended: wasSuspended },
    afterState: { suspended: input.suspended, note },
  });

  // Resuming pins nothing: clearing the flag re-enables active installations on
  // whatever version is current now, which may have moved on during the suspension
  // because updates stay available throughout it.
  return { pluginId: plugin.id, suspended: input.suspended, note };
}
