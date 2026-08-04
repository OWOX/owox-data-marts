import { Args, Flags } from '@oclif/core';
import type {
  OWOXApiClient,
  OWOXPluginPublication,
  OWOXPluginPublicationScope,
  OWOXPublishPluginInput,
} from '@owox/api-client';

export type PluginsClient = Pick<OWOXApiClient, 'plugins'>;

export const repositoryArg = {
  repository: Args.string({
    description: 'GitHub repository, as a URL or owner/name',
    required: true,
  }),
};

export const scopeFlag = Flags.string({
  description: 'Authority level to publish at',
  options: ['deployment', 'project', 'member'],
  required: true,
});

/**
 * Selected projects and the wildcard are mutually exclusive.
 *
 * Declared `exclusive` so oclif refuses the combination before any request is sent.
 * The server rejects it as well -- the CLI is not the only client -- but failing here
 * costs the publisher nothing and explains itself better.
 */
export const audienceFlags = {
  'project-id': Flags.string({
    description: 'Deployment scope only. Repeatable. Adds projects to the audience.',
    multiple: true,
    exclusive: ['all-projects'],
  }),
  'all-projects': Flags.boolean({
    description:
      'Deployment scope only. Every current and future project. Indivisible: projects cannot be excluded from it.',
    exclusive: ['project-id'],
  }),
};

export function toPublishInput(
  repository: string,
  flags: { scope: string; 'project-id'?: string[]; 'all-projects'?: boolean }
): OWOXPublishPluginInput {
  return {
    repository,
    scope: flags.scope as OWOXPluginPublicationScope,
    ...(flags['project-id']?.length ? { projectIds: flags['project-id'] } : {}),
    ...(flags['all-projects'] ? { allProjects: true } : {}),
  };
}

export function publishPlugin(
  client: PluginsClient,
  input: OWOXPublishPluginInput
): Promise<OWOXPluginPublication> {
  return client.plugins.publish(input);
}

export function unpublishPlugin(
  client: PluginsClient,
  input: OWOXPublishPluginInput
): Promise<OWOXPluginPublication> {
  return client.plugins.unpublish(input);
}

/**
 * A repository OWOX Data Marts cannot read is the one failure a publisher can actually
 * fix, and the fix is a URL the server hands back. Everything else stays machine-readable JSON
 * on stdout, so this hint goes to stderr.
 */
export function installationHint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code, details } = error as { code?: string; details?: { installationUrl?: string } };
  if (code !== 'GITHUB_REPO_NOT_ACCESSIBLE' || !details?.installationUrl) {
    return null;
  }

  return `OWOX Data Marts cannot read that repository. Install the OWOX Data Marts GitHub App at ${details.installationUrl} and run the same command again.`;
}
