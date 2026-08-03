import type { OWOXPluginUpdateResult } from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';
import { repositoryArg, type PluginsClient } from '../../plugins-support.js';

export function updatePlugin(
  client: PluginsClient,
  repository: string
): Promise<OWOXPluginUpdateResult> {
  return client.plugins.update(repository);
}

/**
 * What the check did, for a person rather than for a pipe.
 *
 * Goes to stderr, like the GitHub App hint, so stdout stays the JSON every other plugins
 * command prints and `| jq` keeps working.
 */
export function updateSummary(result: OWOXPluginUpdateResult): string {
  const version = result.currentSemver ? `v${result.currentSemver}` : 'the current version';
  const outcome =
    result.outcome === 'updated'
      ? `Updated to ${version}. It is now current for everyone using ${result.repository}.`
      : result.outcome === 'already_running'
        ? `A check for ${result.repository} is already running; its result stands.`
        : result.outcome === 'failed'
          ? `The check could not reach GitHub. ${version} stays active.`
          : `Already on the highest eligible release, ${version}.`;

  const next = result.nextCheckAt
    ? `Updates are checked daily; the next automatic check is ${new Date(result.nextCheckAt).toLocaleString()}.`
    : 'Updates are checked daily.';

  return `${outcome}\n${next}`;
}

/**
 * Requests an immediate managed update check.
 *
 * The deployment checks every relevant plugin daily on its own; this asks for the next
 * check now. It accepts no version: whatever valid higher SemVer is found becomes current
 * for every installation of that plugin across the deployment. Rate-limited per plugin
 * and safe to repeat.
 */
export default class PluginsUpdate extends BaseCommand {
  static override description =
    'Ask this deployment to check GitHub for a newer release now. Updates are checked daily anyway; a valid higher version becomes current for everyone using the plugin';

  static override args = repositoryArg;
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  static override examples = [
    '<%= config.bin %> <%= command.id %> https://github.com/OWOX/example-plugin',
    '<%= config.bin %> <%= command.id %> OWOX/example-plugin',
  ];

  async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse(PluginsUpdate);
      this.loadEnvironment(flags);
      const result = await updatePlugin(this.getAuthenticatedClient(), args.repository);
      process.stderr.write(`${updateSummary(result)}\n`);
      this.writeJson(result);
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
