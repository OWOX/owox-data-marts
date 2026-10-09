import { AuthorizationContext } from '../../idp/types/auth.types';
import { Plugin } from '../entities/plugin.entity';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPublicationService } from '../services/plugin-publication.service';

/**
 * Whether the caller manages a publication of this plugin, mirroring the scope rules
 * `ListPublicationsService` enforces: project scope for Project Admins, member scope
 * for the caller's own listings. Deployment scope is handled by the allowlist check.
 */
export async function managesPublicationOf(
  publications: PluginPublicationService,
  pluginId: string,
  context: AuthorizationContext
): Promise<boolean> {
  const scopes: PluginPublicationScope[] = [];
  if (context.roles?.includes('admin')) {
    scopes.push(PluginPublicationScope.PROJECT);
  }
  if (context.userId) {
    scopes.push(PluginPublicationScope.MEMBER);
  }

  for (const scope of scopes) {
    const rows = await publications.listManageable(scope, {
      projectId: context.projectId,
      userId: scope === PluginPublicationScope.MEMBER ? (context.userId ?? undefined) : undefined,
    });
    if (rows.some(row => row.pluginId === pluginId)) {
      return true;
    }
  }

  return false;
}

/**
 * Withholds a private repository's name from anyone but a deployment publisher.
 *
 * Same reason `PluginPresentationMapper.toSource` hides that name on the plugin view: it
 * "would confirm to a member that one specific private repository exists". The owner
 * stays, matching what `toSource` does disclose.
 */
export function visibleRepository(
  plugin: Plugin,
  repository: string,
  isPublisher: boolean
): string {
  return plugin.isPrivateRepo && !isPublisher ? `${plugin.repoOwner}/***` : repository;
}
