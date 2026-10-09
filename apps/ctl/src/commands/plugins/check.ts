import { Flags } from '@oclif/core';
import type { OWOXPluginCheckResult } from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';
import { repositoryArg, type PluginsClient } from '../../plugins-support.js';

export function checkPlugin(
  client: PluginsClient,
  repository: string,
  ref: string,
  version?: string
): Promise<OWOXPluginCheckResult> {
  return client.plugins.check({ repository, ref, ...(version ? { version } : {}) });
}

/** One line per issue, then what a clean result means. Goes to stderr so stdout stays JSON. */
export function checkSummary(result: OWOXPluginCheckResult): string {
  const lines = result.issues.map(issue => `${issue.code}: ${issue.detail}`);

  if (lines.length === 0) {
    const version = result.candidateVersion ? ` ${result.candidateVersion}` : '';
    const sha = result.commitSha ? ` from ${result.commitSha.slice(0, 7)}` : '';
    lines.push(`A release of version${version}${sha} would pass the checks.`);
  }

  if (!result.collectionsEvaluated && result.commitSha) {
    lines.push(
      result.candidateVersion
        ? 'Collection compatibility was not checked: no version is recorded in that compatibility line.'
        : 'Collection compatibility was not checked: the plugin has no current version and no --version was given.'
    );
  }

  return lines.join('\n');
}

/**
 * Dry-runs a release from a branch, tag or commit. Nothing is recorded and the plugin's
 * current version is unchanged. Exits 1 when the release would be rejected.
 */
export default class PluginsCheck extends BaseCommand {
  static override description =
    'Check whether a release from a branch, tag or commit would be accepted, without releasing anything';

  static override args = repositoryArg;
  static override flags = {
    ...BaseCommand.baseFlags,
    ref: Flags.string({ description: 'Branch, tag or commit SHA to check', required: true }),
    version: Flags.string({
      description: 'Candidate SemVer; defaults to the next version after the current one',
    }),
  };

  static override examples = [
    '<%= config.bin %> <%= command.id %> OWOX/example-plugin --ref main',
    '<%= config.bin %> <%= command.id %> OWOX/example-plugin --ref 3f2a1bc --version 1.5.0',
  ];

  async run(): Promise<void> {
    let result: OWOXPluginCheckResult;
    try {
      const { args, flags } = await this.parse(PluginsCheck);
      this.loadEnvironment(flags);
      result = await checkPlugin(
        this.getAuthenticatedClient(),
        args.repository,
        flags.ref,
        flags.version
      );
      process.stderr.write(`${checkSummary(result)}\n`);
      this.writeJson(result);
    } catch (error) {
      this.handleCliError(error);
    }

    if (result.issues.length > 0) this.exit(1);
  }
}
