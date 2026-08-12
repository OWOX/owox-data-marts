import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { GithubAccessMode } from '../enums/github-access-mode.enum';

const DEFAULT_GITHUB_API_BASE_URL = 'https://api.github.com';
const DEFAULT_AUTHENTICATED_SYNC_MIN_INTERVAL_SEC = 30;
const DEFAULT_ANONYMOUS_SYNC_MIN_INTERVAL_SEC = 300;
const DEFAULT_REMOTE_PROBE_TIMEOUT_MS = 8_000;

/** Redirect hops followed while validating a delivery URL. Not configurable. */
const MAX_REDIRECT_HOPS = 5;

/**
 * One page of 100 releases. Not configurable: a sync walks releases newest first and stops
 * at the first that validates, so a second page could only ever hold versions that cannot
 * become current. Needing one would mean the newest hundred releases are all broken, which
 * is the publisher's problem to fix rather than the deployment's to tune around.
 */
const MAX_RELEASE_PAGES = 1;

@Injectable()
export class PluginHostConfigService {
  constructor(
    private readonly config: ConfigService,
    private readonly publicOriginService: PublicOriginService
  ) {}

  /**
   * API key IDs allowed to publish, unpublish, suspend and resume at deployment scope.
   *
   * This allowlist is the whole authorization model for deployment scope -- it stands in
   * for the deployment administration panel the spec deliberately does not build. An unset
   * or blank value yields an empty list, which denies everyone; it must never mean "any".
   */
  get deploymentPublisherApiKeyIds(): readonly string[] {
    return (this.config.get<string>('OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS') ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  }

  get githubApiBaseUrl(): string {
    return this.trimmed('GITHUB_API_BASE_URL') ?? DEFAULT_GITHUB_API_BASE_URL;
  }

  get githubAppId(): string | undefined {
    return this.trimmed('GITHUB_APP_ID');
  }

  /** Only used to build the actionable "install the app here" URL. */
  get githubAppSlug(): string | undefined {
    return this.trimmed('GITHUB_APP_SLUG');
  }

  /**
   * Accepts the PEM itself, or just its base64 body with the armour left off.
   *
   * The armour is what makes a PEM hostile to secret pipelines: `-----BEGIN RSA PRIVATE
   * KEY-----` carries spaces, and the body carries newlines. A store that ends in an
   * unquoted `export KEY=$value` splits on the spaces and eats the backslashes, so the
   * process receives no usable key and no way to tell that is what happened. The body
   * alone is a single word with neither, so it arrives intact and we rebuild the rest.
   *
   * `RSA PRIVATE KEY` for the rebuilt armour because OpenSSL reads both PKCS#1 (what
   * GitHub hands out) and PKCS#8 under it, which leaves nothing to detect.
   */
  get githubAppPrivateKey(): string | undefined {
    // PEM keys are commonly supplied as a single line with escaped newlines.
    const value = this.trimmed('GITHUB_APP_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    if (!value || value.startsWith('-----')) {
      return value;
    }

    return `-----BEGIN RSA PRIVATE KEY-----\n${value}\n-----END RSA PRIVATE KEY-----`;
  }

  /**
   * Which GITHUB_APP_* variables are absent. Empty means App mode is fully configured.
   *
   * Named rather than boolean because a partially configured deployment is the failure
   * worth reporting: App mode switches off silently, and the anonymous fallback then
   * reports a private repository as "install the App", which sends the publisher to
   * GitHub for a fault that lives in our own environment.
   */
  get missingGithubAppVars(): string[] {
    return [
      !this.githubAppId && 'GITHUB_APP_ID',
      !this.githubAppSlug && 'GITHUB_APP_SLUG',
      !this.githubAppPrivateKey && 'GITHUB_APP_PRIVATE_KEY',
    ].filter(Boolean) as string[];
  }

  get isAppModeConfigured(): boolean {
    return this.missingGithubAppVars.length === 0;
  }

  /** Self-managed deployments only. Read by the server, never by the CLI. */
  get githubToken(): string | undefined {
    return this.trimmed('GITHUB_TOKEN');
  }

  getSyncMinIntervalMs(accessMode: GithubAccessMode): number {
    const defaultSeconds =
      accessMode === GithubAccessMode.ANONYMOUS
        ? DEFAULT_ANONYMOUS_SYNC_MIN_INTERVAL_SEC
        : DEFAULT_AUTHENTICATED_SYNC_MIN_INTERVAL_SEC;

    return this.numeric('PLUGIN_HOST_SYNC_MIN_INTERVAL_SEC', defaultSeconds) * 1000;
  }

  get maxReleasePages(): number {
    return MAX_RELEASE_PAGES;
  }

  get remoteProbeTimeoutMs(): number {
    return this.numeric('PLUGIN_HOST_REMOTE_PROBE_TIMEOUT_MS', DEFAULT_REMOTE_PROBE_TIMEOUT_MS);
  }

  get maxRedirectHops(): number {
    return MAX_REDIRECT_HOPS;
  }

  /**
   * Origin a plugin vendor may name in `frame-ancestors` for us to accept it.
   *
   * The deployment's own public origin, not a second setting beside it. A separate
   * variable would have to mean "PUBLIC_ORIGIN is right for everything except plugins",
   * and the page that embeds the iframe is served from that same origin -- so two values
   * could only ever drift into validating against something that is not the real embedder.
   */
  get publicOrigin(): string | undefined {
    try {
      return new URL(this.publicOriginService.getPublicOrigin()).origin;
    } catch {
      // getPublicOrigin falls back to localhost and validates before returning, so this
      // is unreachable in practice; refusing beats booting on an origin we cannot parse.
      return undefined;
    }
  }

  /**
   * Not every value arrives as a string: the boot-time schema in env-validation.config
   * coerces the numeric plugin settings, so ConfigService hands back numbers for them.
   * Normalizing here keeps that a detail of validation rather than a trap for callers.
   */
  private trimmed(key: string): string | undefined {
    const value = this.config.get<unknown>(key);
    return value === undefined || value === null ? undefined : String(value).trim() || undefined;
  }

  private numeric(key: string, fallback: number): number {
    const parsed = Number(this.trimmed(key));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
