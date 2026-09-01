import { Injectable, Logger } from '@nestjs/common';
import { fetchWithBackoff } from '@owox/internal-helpers';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { GithubReleaseDto } from '../dto/domain/github-release.dto';
import { GithubRepoDto } from '../dto/domain/github-repo.dto';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { GithubReadPolicy } from '../enums/github-read-policy.enum';
import {
  GithubApiError,
  GithubRateLimitedError,
  GithubRepoNotAccessibleError,
  GithubRepoNotFoundError,
} from '../errors/plugin-host.errors';
import { GithubRepoRef } from '../utils/github-repo-locator.util';
import { GithubAccess, GithubAuthService } from './github-auth.service';

const RELEASES_PER_PAGE = 100;
/** A plugin.json far past this is not a manifest; refuse rather than buffer it. */
const MAX_MANIFEST_BYTES = 1024 * 1024;

interface GithubRepoResponse {
  id: number;
  owner: { login: string };
  name: string;
  private: boolean;
  html_url: string;
}

interface GithubReleaseResponse {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
}

/**
 * Thin GitHub REST client, scoped to what plugin synchronization needs.
 *
 * Plain fetch through the shared backoff helper rather than an SDK: four endpoints do
 * not justify a dependency, and the backoff helper already handles 429 and 5xx.
 */
@Injectable()
export class GithubApiService {
  private readonly logger = new Logger(GithubApiService.name);

  constructor(
    private readonly auth: GithubAuthService,
    private readonly config: PluginHostConfigService
  ) {}

  /**
   * Resolves the repository and, with it, the plugin's identity anchor.
   *
   * Redirects are followed: GitHub answers 301 after a rename or transfer, so a stale
   * locator lands on the same numeric id and cannot create a second plugin.
   */
  async getRepo(
    ref: GithubRepoRef,
    policy: GithubReadPolicy = GithubReadPolicy.CONFIGURED
  ): Promise<GithubRepoDto> {
    const access = await this.getAccess(ref, policy);
    const response = await this.request(access, `/repos/${ref.owner}/${ref.name}`, {
      redirect: 'follow',
    });

    if (response.status === 404) {
      if (policy === GithubReadPolicy.PUBLIC_ONLY) {
        throw new GithubRepoNotFoundError(ref.owner, ref.name);
      }
      const installationUrl = this.auth.buildInstallationUrl();
      // The access mode is the whole diagnosis and never reaches the response: a private
      // repository read as ANONYMOUS or SERVER_TOKEN answers 404 exactly like one that
      // does not exist, and the publisher is told to install an App that may already be
      // installed. Only the log can say which of the two actually happened.
      //
      // WARN rather than ERROR: a mistyped repository reaches this line just as often as
      // a real access fault, and a deployment alerting on ERROR must not page on someone
      // else's typo.
      this.logger.warn(
        `GitHub returned 404 for ${ref.owner}/${ref.name} using ${access.mode} access. ` +
          'If the repository exists, this access mode cannot read it.'
      );
      // With an App configured, 404 usually means "private and not granted" rather than
      // "does not exist" -- and that distinction is the difference between an actionable
      // message and a dead end.
      throw installationUrl
        ? new GithubRepoNotAccessibleError(ref.owner, ref.name, installationUrl)
        : new GithubRepoNotFoundError(ref.owner, ref.name);
    }

    this.assertOk(response, `/repos/${ref.owner}/${ref.name}`, access.mode);

    const body = (await response.json()) as GithubRepoResponse;
    return {
      githubRepoId: String(body.id),
      owner: body.owner.login,
      name: body.name,
      isPrivate: body.private,
      htmlUrl: body.html_url,
      accessMode: access.mode,
    };
  }

  /** Drafts and prereleases are returned as-is; filtering them is the caller's job. */
  async listReleases(
    ref: GithubRepoRef,
    policy: GithubReadPolicy = GithubReadPolicy.CONFIGURED
  ): Promise<GithubReleaseDto[]> {
    const access = await this.getAccess(ref, policy);
    const releases: GithubReleaseDto[] = [];

    for (let page = 1; page <= this.config.maxReleasePages; page++) {
      const path = `/repos/${ref.owner}/${ref.name}/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`;
      const response = await this.request(access, path);
      this.assertOk(response, path, access.mode);

      const body = (await response.json()) as GithubReleaseResponse[];
      releases.push(
        ...body.map(release => ({
          githubReleaseId: String(release.id),
          tagName: release.tag_name,
          isDraft: release.draft,
          isPrerelease: release.prerelease,
          publishedAt: release.published_at ? new Date(release.published_at) : null,
        }))
      );

      if (body.length < RELEASES_PER_PAGE) {
        break;
      }
    }

    return releases;
  }

  /**
   * Null when the tag no longer resolves -- a deleted tag is one ineligible Release,
   * not a failed sync.
   */
  async resolveCommitSha(
    ref: GithubRepoRef,
    tagName: string,
    policy: GithubReadPolicy = GithubReadPolicy.CONFIGURED
  ): Promise<string | null> {
    const access = await this.getAccess(ref, policy);
    // /commits/{ref} dereferences annotated tags in a single call; /git/ref/tags would
    // need a second hop to get from the tag object to its commit.
    const path = `/repos/${ref.owner}/${ref.name}/commits/${encodeURIComponent(tagName)}`;
    const response = await this.request(access, path);

    if (response.status === 404 || response.status === 422) {
      return null;
    }
    this.assertOk(response, path, access.mode);

    const body = (await response.json()) as { sha: string };
    return body.sha;
  }

  /** Pinned to an exact commit, so a moved branch cannot change what we read. */
  async getFileAtCommit(
    ref: GithubRepoRef,
    path: string,
    commitSha: string,
    policy: GithubReadPolicy = GithubReadPolicy.CONFIGURED
  ): Promise<string | null> {
    const access = await this.getAccess(ref, policy);
    const requestPath = `/repos/${ref.owner}/${ref.name}/contents/${path}?ref=${commitSha}`;
    const response = await this.request(access, requestPath, {
      headers: { ...access.headers, Accept: 'application/vnd.github.raw' },
    });

    if (response.status === 404) {
      return null;
    }
    this.assertOk(response, requestPath, access.mode);

    // Null rather than a throw: `parsePluginManifest` maps it to MANIFEST_MISSING, which
    // keeps one oversized manifest a rejection of its own release instead of an aborted sync.
    return readCapped(response, MAX_MANIFEST_BYTES);
  }

  private request(access: GithubAccess, path: string, init: RequestInit = {}): Promise<Response> {
    return fetchWithBackoff(`${this.config.githubApiBaseUrl}${path}`, {
      headers: access.headers,
      ...init,
    });
  }

  private getAccess(ref: GithubRepoRef, policy: GithubReadPolicy): Promise<GithubAccess> {
    return policy === GithubReadPolicy.PUBLIC_ONLY
      ? Promise.resolve(this.auth.getAnonymousAccess())
      : this.auth.getRepoAccess(ref);
  }

  private assertOk(response: Response, path: string, accessMode: GithubAccessMode): void {
    if (response.ok) {
      return;
    }

    // GitHub signals exhaustion with 403 or 429 plus a zeroed remaining count; the
    // reset header turns "try later" into an actual timestamp. The access mode goes
    // with it because the limit differs sharply per mode -- anonymous reads run out
    // far sooner than an App installation, and that is what the publisher must act on.
    if (
      (response.status === 403 || response.status === 429) &&
      response.headers.get('x-ratelimit-remaining') === '0'
    ) {
      const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0);
      this.logger.error(`GitHub rate limit exhausted for ${accessMode} access on ${path}`);
      throw new GithubRateLimitedError(new Date(reset * 1000).toISOString(), accessMode);
    }

    // Publisher routes render this error without the filter that logs member-facing ones,
    // so without this line a failed publish leaves nothing behind on the server at all.
    this.logger.error(`GitHub returned ${response.status} for ${path} using ${accessMode} access`);
    throw new GithubApiError(response.status, path);
  }
}

/**
 * Null when the body exceeds `limit`.
 *
 * A raw-content response can arrive chunked with no `Content-Length`, so trusting that
 * header alone leaves `text()` buffering whatever the repository serves. Reading through
 * the stream keeps the cap true either way.
 */
async function readCapped(response: Response, limit: number): Promise<string | null> {
  if (Number(response.headers.get('content-length') ?? 0) > limit) {
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    size += value.length;
    if (size > limit) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}
