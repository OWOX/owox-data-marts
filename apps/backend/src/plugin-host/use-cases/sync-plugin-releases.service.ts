import { Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { GithubReleaseDto } from '../dto/domain/github-release.dto';
import { GithubRepoDto } from '../dto/domain/github-repo.dto';
import {
  PluginSyncResultDto,
  ReleaseRejectionDto,
  SyncPluginReleasesCommand,
  SyncReport,
} from '../dto/domain/plugin-sync.dto';
import { Plugin } from '../entities/plugin.entity';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import {
  PluginSyncLeaseLostError,
  PluginSyncRateLimitedError,
  PluginVersionConflictError,
} from '../errors/plugin-host.errors';
import { GithubApiService } from '../services/github-api.service';
import { PluginService } from '../services/plugin.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { RemoteUrlValidatorService } from '../services/remote-url-validator.service';
import { GithubRepoRef, parseGithubRepoLocator } from '../utils/github-repo-locator.util';
import {
  findIncompatibleCollectionChange,
  parsePluginManifest,
} from '../utils/plugin-manifest.util';
import { compareSemver, formatSemver, parseReleaseTag } from '../utils/semver.util';

/** A release that survived the free checks and is worth spending network calls on. */
interface Candidate {
  readonly release: GithubReleaseDto;
  readonly semver: string;
}

/**
 * Brings OWOX's record of a plugin's versions in line with its GitHub Releases.
 *
 * The one operation behind both publishing and Check-and-update. Per-release problems
 * are collected as rejections rather than thrown, so one broken Release cannot abort a
 * sync that also contains good ones.
 */
@Injectable()
export class SyncPluginReleasesService {
  private readonly logger = new Logger(SyncPluginReleasesService.name);

  constructor(
    private readonly githubApi: GithubApiService,
    private readonly remoteUrlValidator: RemoteUrlValidatorService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    private readonly config: PluginHostConfigService
  ) {}

  async run(command: SyncPluginReleasesCommand): Promise<PluginSyncResultDto> {
    const ref = parseGithubRepoLocator(command.repoLocator);
    const repo = await this.githubApi.getRepo(ref);
    const plugin = await this.findOrCreatePlugin(repo);

    const syncLeaseId = await this.pluginService.tryClaimSyncSlot(
      plugin.id,
      this.config.syncMinIntervalMs
    );
    if (!syncLeaseId) {
      return this.throttled(plugin, repo, command.enforceThrottle);
    }

    try {
      const rejections: ReleaseRejectionDto[] = [];
      const candidates = this.selectCandidates(await this.githubApi.listReleases(ref), rejections);

      const accepted: string[] = [];
      const unchanged: string[] = [];
      // Newest first, stopping at the first release that settles. Nothing pins an
      // installation to a version -- the runtime resolves `currentVersionId` on every load
      // -- so an older release can never become current, and the GitHub calls to record it
      // buy nothing. Everything newer than the winner is still reported, which is the part
      // a publisher needs to see.
      for (const candidate of candidates) {
        const settled = await this.processCandidate(
          plugin.id,
          ref,
          candidate,
          { accepted, unchanged, rejections },
          syncLeaseId
        );
        if (settled) {
          break;
        }
      }

      return await this.finish(plugin, repo, { accepted, unchanged, rejections }, syncLeaseId);
    } finally {
      try {
        await this.pluginService.releaseSyncSlot(plugin.id, syncLeaseId);
      } catch (error) {
        this.logger.error(
          `Failed to release sync lease for plugin ${plugin.id}: ${castError(error).message}`
        );
      }
    }
  }

  private async findOrCreatePlugin(repo: GithubRepoDto): Promise<Plugin> {
    const existing = await this.pluginService.findByGithubRepoId(repo.githubRepoId);
    if (!existing) {
      return this.pluginService.createOrFindForRepo(repo);
    }

    // A rename or transfer resolves here, to the same plugin. Only the cached
    // management metadata moves; identity does not.
    if (
      existing.repoOwner !== repo.owner ||
      existing.repoName !== repo.name ||
      existing.isPrivateRepo !== repo.isPrivate
    ) {
      await this.pluginService.syncRepoNaming(existing.id, repo);
    }

    return existing;
  }

  /**
   * Filters on everything knowable for free, so a repository full of drafts and
   * release candidates costs zero GitHub calls beyond the release listing itself.
   */
  private selectCandidates(
    releases: GithubReleaseDto[],
    rejections: ReleaseRejectionDto[]
  ): Candidate[] {
    const candidates: Candidate[] = [];

    for (const release of releases) {
      if (release.isDraft) {
        rejections.push(this.rejection(release, ReleaseRejectionCode.DRAFT, 'Release is a draft'));
        continue;
      }

      if (release.isPrerelease) {
        rejections.push(
          this.rejection(
            release,
            ReleaseRejectionCode.PRERELEASE_FLAG,
            'Release is marked as a GitHub prerelease'
          )
        );
        continue;
      }

      const parsed = parseReleaseTag(release.tagName);
      if (!parsed.ok) {
        rejections.push(this.rejectTag(release, parsed.reason));
        continue;
      }

      candidates.push({ release, semver: formatSemver(parsed.parts) });
    }

    // Descending: the run stops at the first release that settles, so the highest SemVer
    // has to be the one it reaches first.
    return candidates.sort((a, b) => compareSemver(b.semver, a.semver));
  }

  /** True when this release is usable as the current version, so the run can stop here. */
  private async processCandidate(
    pluginId: string,
    ref: GithubRepoRef,
    candidate: Candidate,
    into: { accepted: string[]; unchanged: string[]; rejections: ReleaseRejectionDto[] },
    syncLeaseId: string
  ): Promise<boolean> {
    const { release, semver } = candidate;

    const commitSha = await this.githubApi.resolveCommitSha(ref, release.tagName);
    if (!commitSha) {
      into.rejections.push(
        this.rejection(
          release,
          ReleaseRejectionCode.COMMIT_UNRESOLVABLE,
          `Tag ${release.tagName} does not resolve to a commit`
        )
      );
      return false;
    }

    const recorded = await this.versionService.findBySemver(pluginId, semver);
    if (recorded) {
      // Unchanged only when both the commit and the Release match. Comparing the commit
      // alone would let a deleted-and-recreated Release pass as untouched.
      if (
        recorded.commitSha === commitSha &&
        recorded.githubReleaseId === release.githubReleaseId
      ) {
        into.unchanged.push(semver);
        return true;
      }

      into.rejections.push(
        this.rejection(
          release,
          ReleaseRejectionCode.VERSION_CONFLICT,
          `Version ${semver} is already recorded from commit ${recorded.commitSha} (release ${recorded.githubReleaseId}); refusing to replace it with commit ${commitSha} (release ${release.githubReleaseId})`
        )
      );
      return false;
    }

    const manifestSource = await this.githubApi.getFileAtCommit(ref, 'plugin.json', commitSha);
    const manifest = parsePluginManifest(manifestSource);
    if (!manifest.ok) {
      into.rejections.push(this.rejection(release, manifest.code, manifest.detail));
      return false;
    }

    const currentVersion = (await this.versionService.findAllByPluginId(pluginId)).reduce<
      { semver: string; collections: PluginVersionCollections } | undefined
    >(
      (highest, version) =>
        !highest || compareSemver(version.semver, highest.semver) > 0
          ? { semver: version.semver, collections: version.collections ?? [] }
          : highest,
      undefined
    );
    const incompatibility = findIncompatibleCollectionChange(
      currentVersion?.collections ?? [],
      manifest.manifest.collections
    );
    if (incompatibility) {
      into.rejections.push(
        this.rejection(release, ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE, incompatibility)
      );
      return false;
    }

    const delivery = await this.remoteUrlValidator.validate(manifest.manifest.delivery.url);
    if (!delivery.ok) {
      into.rejections.push(this.rejection(release, delivery.code, delivery.detail));
      return false;
    }

    try {
      const inserted = await this.versionService.insertVersionForLease(
        {
          pluginId,
          semver,
          commitSha,
          githubReleaseId: release.githubReleaseId,
          tagName: release.tagName,
          displayName: manifest.manifest.name,
          description: manifest.manifest.description,
          deliveryUrl: manifest.manifest.delivery.url,
          collections: manifest.manifest.collections,
          releasePublishedAt: release.publishedAt,
        },
        syncLeaseId
      );
      if (!inserted) throw new PluginSyncLeaseLostError(pluginId);
      into.accepted.push(semver);
      return true;
    } catch (error) {
      if (error instanceof PluginSyncLeaseLostError) throw error;
      if (!(error instanceof PluginVersionConflictError)) throw error;
      // A concurrent sync recorded this SemVer first. Losing that race is not a reason
      // to fail the whole run -- see the rate-limiter caveat on tryClaimSyncSlot.
      this.logger.warn(
        `Concurrent insert of ${semver} for plugin ${pluginId}: ${castError(error).message}`
      );
      into.rejections.push(
        this.rejection(
          release,
          ReleaseRejectionCode.VERSION_CONFLICT,
          `Version ${semver} was recorded concurrently by another synchronization`
        )
      );
      // The other run recorded this same SemVer, so it is settled either way.
      return true;
    }
  }

  private async finish(
    plugin: Plugin,
    repo: GithubRepoDto,
    outcome: { accepted: string[]; unchanged: string[]; rejections: ReleaseRejectionDto[] },
    syncLeaseId: string
  ): Promise<PluginSyncResultDto> {
    const versions = await this.versionService.findAllByPluginId(plugin.id);
    const current = versions.reduce<{ id: string; semver: string } | null>(
      (highest, version) =>
        !highest || compareSemver(version.semver, highest.semver) > 0 ? version : highest,
      null
    );

    const report: SyncReport = {
      syncedAt: new Date().toISOString(),
      accessMode: repo.accessMode,
      acceptedSemvers: outcome.accepted,
      unchangedSemvers: outcome.unchanged,
      rejections: outcome.rejections,
    };

    const saved = await this.pluginService.saveSyncOutcome(
      plugin.id,
      current?.id ?? null,
      report,
      syncLeaseId
    );
    if (!saved) throw new PluginSyncLeaseLostError(plugin.id);

    return {
      pluginId: plugin.id,
      githubRepoId: repo.githubRepoId,
      repository: `${repo.owner}/${repo.name}`,
      currentSemver: current?.semver ?? null,
      currentVersionId: current?.id ?? null,
      report,
      throttled: false,
    };
  }

  private async throttled(
    plugin: Plugin,
    repo: GithubRepoDto,
    enforce: boolean
  ): Promise<PluginSyncResultDto> {
    if (enforce) {
      throw new PluginSyncRateLimitedError(Math.ceil(this.config.syncMinIntervalMs / 1000));
    }

    const current = plugin.currentVersionId
      ? await this.versionService.findById(plugin.currentVersionId)
      : null;

    return {
      pluginId: plugin.id,
      githubRepoId: repo.githubRepoId,
      repository: `${repo.owner}/${repo.name}`,
      currentSemver: current?.semver ?? null,
      currentVersionId: current?.id ?? null,
      report: plugin.lastSyncReport ?? this.emptyReport(repo),
      throttled: true,
    };
  }

  private emptyReport(repo: GithubRepoDto): SyncReport {
    return {
      syncedAt: new Date().toISOString(),
      accessMode: repo.accessMode,
      acceptedSemvers: [],
      unchangedSemvers: [],
      rejections: [],
    };
  }

  private rejectTag(
    release: GithubReleaseDto,
    reason: 'not-semver' | 'prerelease' | 'build-metadata'
  ): ReleaseRejectionDto {
    if (reason === 'prerelease') {
      return this.rejection(
        release,
        ReleaseRejectionCode.PRERELEASE_TAG,
        `Prerelease tags are not eligible. Tag the release ${release.tagName.replace(/-.*$/, '')} instead, or mark it as a GitHub prerelease.`
      );
    }

    if (reason === 'build-metadata') {
      return this.rejection(
        release,
        ReleaseRejectionCode.BUILD_METADATA_TAG,
        `Build metadata is not eligible: SemVer ignores it when ordering versions, so ${release.tagName} could not be told apart from the plain version.`
      );
    }

    return this.rejection(
      release,
      ReleaseRejectionCode.INVALID_TAG,
      `Tag ${release.tagName} is not strict SemVer, optionally prefixed with v`
    );
  }

  private rejection(
    release: GithubReleaseDto,
    code: ReleaseRejectionCode,
    detail: string
  ): ReleaseRejectionDto {
    return { tagName: release.tagName, githubReleaseId: release.githubReleaseId, code, detail };
  }
}

type PluginVersionCollections = NonNullable<
  Awaited<ReturnType<PluginVersionService['findById']>>
>['collections'];
