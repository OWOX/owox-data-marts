import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PluginHostConfigService } from '../config/plugin-host.config';
import {
  CheckPluginReleaseCommand,
  PluginReleaseCheckResultDto,
} from '../dto/domain/check-plugin-release.command';
import { Plugin } from '../entities/plugin.entity';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { PluginCheckRateLimitedError } from '../errors/plugin-host.errors';
import { GithubApiService } from '../services/github-api.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { ReleaseCandidateRulesService } from '../services/release-candidate-rules.service';
import { parseGithubRepoLocator } from '../utils/github-repo-locator.util';
import { formatSemver, parseReleaseTag } from '../utils/semver.util';
import { managesPublicationOf, visibleRepository } from './plugin-publisher-access';

/** Whether a release from one ref would be accepted, judged by release sync's rules and recorded nowhere. */
@Injectable()
export class CheckPluginReleaseService {
  // ponytail: per-instance limit; N replicas allow N checks per interval. Move to a DB column if GitHub quota pressure appears.
  private readonly lastCheckAt = new Map<string, number>();

  constructor(
    private readonly pluginService: PluginService,
    private readonly authorization: PublicationAuthorizationService,
    private readonly publications: PluginPublicationService,
    private readonly versionService: PluginVersionService,
    private readonly githubApi: GithubApiService,
    private readonly candidateRules: ReleaseCandidateRulesService,
    private readonly config: PluginHostConfigService
  ) {}

  async run(command: CheckPluginReleaseCommand): Promise<PluginReleaseCheckResultDto> {
    const namedSemver = command.version === undefined ? null : eligibleSemver(command.version);
    const locator = parseGithubRepoLocator(command.repoLocator);
    const plugin = await this.pluginService.findByRepoName(locator.owner, locator.name);
    const isPublisher = this.authorization.isDeploymentPublisher(command.context);
    if (
      !plugin ||
      !(isPublisher || (await managesPublicationOf(this.publications, plugin.id, command.context)))
    ) {
      throw new NotFoundException(
        `Plugin ${locator.owner}/${locator.name} was not found on this deployment`
      );
    }
    this.claimSlot(plugin.id);

    const semver = namedSemver ?? (await this.nextVersionOf(plugin));
    const ref = { owner: plugin.repoOwner, name: plugin.repoName };
    const identity = {
      pluginId: plugin.id,
      repository: visibleRepository(plugin, `${ref.owner}/${ref.name}`, isPublisher),
      candidateVersion: semver,
    };

    const commitSha = await this.githubApi.resolveCommitSha(ref, command.ref);
    if (!commitSha) {
      return {
        ...identity,
        commitSha: null,
        baselineVersion: null,
        collectionsEvaluated: false,
        issues: [
          {
            code: ReleaseRejectionCode.COMMIT_UNRESOLVABLE,
            detail: `Ref ${command.ref} does not resolve to a commit`,
          },
        ],
      };
    }

    const recorded = semver ? await this.versionService.findBySemver(plugin.id, semver) : null;
    const report = await this.candidateRules.collectAll({
      pluginId: plugin.id,
      ref,
      commitSha,
      semver,
    });

    return {
      ...identity,
      commitSha,
      baselineVersion: report.baselineSemver,
      collectionsEvaluated: report.collectionsEvaluated,
      issues: [
        ...(recorded
          ? [
              {
                code: ReleaseRejectionCode.VERSION_CONFLICT,
                detail: `Version ${semver} is already recorded from commit ${recorded.commitSha}`,
              },
            ]
          : []),
        ...report.issues,
      ],
    };
  }

  private claimSlot(pluginId: string): void {
    const mode = this.config.isAppModeConfigured
      ? GithubAccessMode.APP
      : this.config.githubToken
        ? GithubAccessMode.SERVER_TOKEN
        : GithubAccessMode.ANONYMOUS;
    const intervalMs = this.config.getSyncMinIntervalMs(mode);
    const now = Date.now();
    const last = this.lastCheckAt.get(pluginId);
    if (last !== undefined && now - last < intervalMs) {
      throw new PluginCheckRateLimitedError(Math.ceil((last + intervalMs - now) / 1000));
    }
    this.lastCheckAt.set(pluginId, now);
  }

  private async nextVersionOf(plugin: Plugin): Promise<string | null> {
    const current = plugin.currentVersionId
      ? await this.versionService.findById(plugin.currentVersionId)
      : null;
    if (!current) return null;
    const [major, minor, patch] = current.semver.split('.').map(Number);
    return major === 0 ? `0.${minor}.${patch + 1}` : `${major}.${minor + 1}.0`;
  }
}

function eligibleSemver(version: string): string {
  const parsed = parseReleaseTag(version);
  if (!parsed.ok) {
    throw new BadRequestException(
      `Version ${version} is not eligible: use X.Y.Z, optionally prefixed with v, without prerelease or build metadata`
    );
  }
  return formatSemver(parsed.parts);
}
