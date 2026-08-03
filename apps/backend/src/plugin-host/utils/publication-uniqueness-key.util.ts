import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';

export interface UniquenessKeyInput {
  readonly scope: PluginPublicationScope;
  readonly pluginId: string;
  readonly projectId?: string | null;
  readonly userId?: string | null;
}

/**
 * Builds the identity of a logical publication.
 *
 * The three scopes have different uniqueness rules -- one publication per plugin at
 * deployment scope, per (plugin, project) at project scope, per (plugin, project,
 * member) at member scope -- and neither SQLite nor MySQL can express that as one
 * composite index, because both treat NULLs as distinct. Collapsing the rules into a
 * single string lets a plain unique index enforce all three.
 *
 * Segments are percent-encoded. Project and user ids are opaque strings from the IDP,
 * and without escaping (project 'a', user 'b:c') and (project 'a:b', user 'c') would
 * produce the same key -- meaning one member's publication could silently become
 * another's.
 */
export function buildUniquenessKey(input: UniquenessKeyInput): string {
  const plugin = encodeURIComponent(input.pluginId);

  switch (input.scope) {
    case PluginPublicationScope.DEPLOYMENT:
      return `deployment:${plugin}`;

    case PluginPublicationScope.PROJECT:
      return `project:${plugin}:${encodeURIComponent(requireValue(input.projectId, 'projectId'))}`;

    case PluginPublicationScope.MEMBER:
      return `member:${plugin}:${encodeURIComponent(
        requireValue(input.projectId, 'projectId')
      )}:${encodeURIComponent(requireValue(input.userId, 'userId'))}`;

    default:
      throw new Error(`Unknown publication scope: ${String(input.scope)}`);
  }
}

function requireValue(value: string | null | undefined, field: string): string {
  if (!value) {
    throw new Error(`${field} is required to identify a publication at this scope`);
  }
  return value;
}
