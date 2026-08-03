import { Injectable, Logger } from '@nestjs/common';
import { fetchWithBackoff } from '@owox/internal-helpers';
import * as jwt from 'jsonwebtoken';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { GithubAuthConfigError } from '../errors/plugin-host.errors';
import { GithubRepoRef } from '../utils/github-repo-locator.util';

export interface GithubAccess {
  readonly mode: GithubAccessMode;
  /** Accept, API version, user agent, and Authorization where a credential exists. */
  readonly headers: Record<string, string>;
}

/** GitHub rejects an App JWT issued more than 10 minutes ago. */
const APP_JWT_LIFETIME_SEC = 540;
/** Back-date slightly so a fast clock on our side is not rejected outright. */
const APP_JWT_CLOCK_SKEW_SEC = 60;
/** Re-mint before the installation token actually lapses. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

const BASE_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'owox-data-marts',
};

interface CachedToken {
  readonly token: string;
  readonly expiresAt: number;
}

/**
 * Resolves how to authenticate a GitHub read, in the order the spec requires:
 * App installation token, then the deployment's GITHUB_TOKEN, then anonymously.
 *
 * Fall-through is deliberate. An App configured for the organisation but never
 * installed on a given public repository must not stop that repository from being
 * published -- public third-party repositories are explicitly supported. The hard
 * failure, with an actionable installation URL, is raised one level up by
 * GithubApiService once the repository turns out to be genuinely unreadable.
 */
@Injectable()
export class GithubAuthService {
  private readonly logger = new Logger(GithubAuthService.name);
  private readonly tokenCache = new Map<number, CachedToken>();
  /**
   * Keyed by owner/name. `getRepoAccess` runs at the top of every GithubApiService method,
   * so without this a single sync re-asks GitHub which installation owns the repository
   * once per call -- against the very limit GithubRateLimitedError models. The id is
   * stable per repository; uninstalling the App is a restart-level change.
   */
  private readonly installationCache = new Map<string, number>();

  constructor(private readonly config: PluginHostConfigService) {}

  async getRepoAccess(ref: GithubRepoRef): Promise<GithubAccess> {
    if (this.config.isAppModeConfigured) {
      const installationId = await this.findInstallationId(ref);
      if (installationId !== null) {
        const token = await this.mintInstallationToken(installationId);
        return this.access(GithubAccessMode.APP, token);
      }
    }

    const serverToken = this.config.githubToken;
    if (serverToken) {
      return this.access(GithubAccessMode.SERVER_TOKEN, serverToken);
    }

    return this.access(GithubAccessMode.ANONYMOUS);
  }

  /** Where a publisher goes to grant access. Null when this deployment has no App. */
  buildInstallationUrl(): string | null {
    const slug = this.config.githubAppSlug;
    return slug ? `https://github.com/apps/${slug}/installations/new` : null;
  }

  private access(mode: GithubAccessMode, token?: string): GithubAccess {
    return {
      mode,
      headers: token ? { ...BASE_HEADERS, Authorization: `Bearer ${token}` } : { ...BASE_HEADERS },
    };
  }

  /** Null when the App is not installed on this repository. */
  private async findInstallationId(ref: GithubRepoRef): Promise<number | null> {
    const key = `${ref.owner}/${ref.name}`.toLowerCase();
    const cached = this.installationCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const response = await fetchWithBackoff(
      `${this.config.githubApiBaseUrl}/repos/${ref.owner}/${ref.name}/installation`,
      { headers: { ...BASE_HEADERS, Authorization: `Bearer ${this.signAppJwt()}` } }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      this.logger.warn(
        `GitHub App installation lookup for ${ref.owner}/${ref.name} returned ${response.status}; falling back`
      );
      return null;
    }

    const body = (await response.json()) as { id?: number };
    if (typeof body.id !== 'number') {
      return null;
    }

    // Only a positive answer is cached: "not installed" is what a publisher fixes between
    // two attempts, so remembering it would outlive the problem.
    this.installationCache.set(key, body.id);
    return body.id;
  }

  private async mintInstallationToken(installationId: number): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
      return cached.token;
    }

    const response = await fetchWithBackoff(
      `${this.config.githubApiBaseUrl}/app/installations/${installationId}/access_tokens`,
      { method: 'POST', headers: { ...BASE_HEADERS, Authorization: `Bearer ${this.signAppJwt()}` } }
    );

    if (!response.ok) {
      throw new GithubAuthConfigError([`installation ${installationId} token request`]);
    }

    const body = (await response.json()) as { token: string; expires_at: string };
    // NOTE: in-process cache, so each instance mints its own. Wasteful across a
    // multi-instance deployment, not incorrect; share it only if GitHub's App rate
    // limit is ever actually hit.
    this.tokenCache.set(installationId, {
      token: body.token,
      expiresAt: Date.parse(body.expires_at),
    });

    return body.token;
  }

  private signAppJwt(): string {
    const appId = this.config.githubAppId;
    const privateKey = this.config.githubAppPrivateKey;
    if (!appId || !privateKey) {
      throw new GithubAuthConfigError(
        [!appId && 'GITHUB_APP_ID', !privateKey && 'GITHUB_APP_PRIVATE_KEY'].filter(
          Boolean
        ) as string[]
      );
    }

    const now = Math.floor(Date.now() / 1000);
    try {
      return jwt.sign(
        { iss: appId, iat: now - APP_JWT_CLOCK_SKEW_SEC, exp: now + APP_JWT_LIFETIME_SEC },
        privateKey,
        { algorithm: 'RS256' }
      );
    } catch (error) {
      // A malformed key is a deployment misconfiguration, not a transient GitHub
      // problem -- surfacing it as a network error would send publishers chasing ghosts.
      this.logger.error(
        `Failed to sign the GitHub App JWT: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new GithubAuthConfigError(['GITHUB_APP_PRIVATE_KEY']);
    }
  }
}
