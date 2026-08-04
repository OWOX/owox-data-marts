import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_GITHUB_API_BASE_URL = 'https://api.github.com';
const DEFAULT_SYNC_MIN_INTERVAL_SEC = 300;
/**
 * One page of 100. A sync stops at the newest release that validates, so pages beyond the
 * first can only hold versions that could never become current.
 */
const DEFAULT_MAX_RELEASE_PAGES = 1;
const DEFAULT_REMOTE_PROBE_TIMEOUT_MS = 8_000;

/** Redirect hops followed while validating a delivery URL. Not configurable. */
const MAX_REDIRECT_HOPS = 5;

@Injectable()
export class PluginHostConfigService {
  constructor(private readonly config: ConfigService) {}

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

  get githubAppPrivateKey(): string | undefined {
    // PEM keys are commonly supplied as a single line with escaped newlines.
    return this.trimmed('GITHUB_APP_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  }

  get isAppModeConfigured(): boolean {
    return Boolean(this.githubAppId && this.githubAppSlug && this.githubAppPrivateKey);
  }

  /** Self-managed deployments only. Read by the server, never by the CLI. */
  get githubToken(): string | undefined {
    return this.trimmed('GITHUB_TOKEN');
  }

  get syncMinIntervalMs(): number {
    return this.numeric('PLUGIN_HOST_SYNC_MIN_INTERVAL_SEC', DEFAULT_SYNC_MIN_INTERVAL_SEC) * 1000;
  }

  get maxReleasePages(): number {
    return this.numeric('PLUGIN_HOST_MAX_RELEASE_PAGES', DEFAULT_MAX_RELEASE_PAGES);
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
   * Undefined means we cannot know our own deployment origin, so a vendor allowlisting
   * a specific host is rejected rather than wrongly accepted.
   */
  get publicOrigin(): string | undefined {
    const raw = this.trimmed('PLUGIN_HOST_PUBLIC_ORIGIN');
    if (!raw) {
      return undefined;
    }

    try {
      return new URL(raw).origin;
    } catch {
      // A malformed value must not stop the server from booting; the effect is the
      // same as leaving it unset, which is the safe direction.
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
