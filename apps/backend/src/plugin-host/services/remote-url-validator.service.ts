import { Injectable, Logger } from '@nestjs/common';
import { fetchWithBackoff } from '@owox/internal-helpers';
import { withGuardedDispatcher } from '../../common/helpers/guarded-dispatcher';
import { assertPublicHttpUrl, UnsafeUrlError } from '../../common/helpers/safe-url.helper';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';

export type RemoteUrlCheckResult =
  | { readonly ok: true; readonly finalUrl: string }
  | { readonly ok: false; readonly code: ReleaseRejectionCode; readonly detail: string };

const SDK_DESCRIPTOR_PATH = '.well-known/owox-plugin.json';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * A delivery URL that needs retries at publish time is not ready to be published, and
 * retrying five redirect hops three times each turns one publish into fifteen requests.
 */
const PROBE_ATTEMPTS = 1;

interface DescriptorBody {
  sdk?: unknown;
  sdkVersion?: unknown;
}

/** What a guarded redirect walk ends on: the first non-redirect response, or why it stopped. */
type WalkResult =
  | { readonly ok: true; readonly response: Response; readonly finalUrl: string }
  | { readonly ok: false; readonly rejection: RemoteUrlCheckResult };

/**
 * Decides whether a plugin's remote entry point may be hosted in an OWOX iframe.
 *
 * Never throws: an unusable delivery URL is one ineligible Release, not a failed sync,
 * so every outcome comes back as a rejection code the sync report can carry.
 */
@Injectable()
export class RemoteUrlValidatorService {
  private readonly logger = new Logger(RemoteUrlValidatorService.name);

  constructor(private readonly config: PluginHostConfigService) {}

  async validate(rawUrl: string): Promise<RemoteUrlCheckResult> {
    try {
      return await this.run(rawUrl);
    } catch (error) {
      this.logger.warn(
        `Delivery URL probe failed for ${rawUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
      return this.reject(
        ReleaseRejectionCode.URL_UNREACHABLE,
        'The delivery URL could not be read'
      );
    }
  }

  private async run(rawUrl: string): Promise<RemoteUrlCheckResult> {
    const walked = await this.walk(rawUrl, ReleaseRejectionCode.URL_UNREACHABLE);
    if (!walked.ok) {
      return walked.rejection;
    }

    const blocked = this.checkEmbeddable(walked.response);
    if (blocked) {
      return this.reject(ReleaseRejectionCode.IFRAME_BLOCKED, blocked);
    }

    return this.checkDescriptor(walked.finalUrl);
  }

  /**
   * Follows redirects with `guard()` on every hop, because `probe()` is deliberately manual.
   *
   * Shared by the delivery URL and the descriptor beside it: leaving the descriptor on a
   * bare probe rejected a vendor for hosting behaviour -- trailing-slash normalisation, an
   * http→https upgrade, a CDN hop -- that the delivery URL is allowed to redirect through.
   * `code` names what an unusable redirect means for each caller.
   */
  private async walk(rawUrl: string, code: ReleaseRejectionCode): Promise<WalkResult> {
    let currentUrl = rawUrl;

    for (let hop = 0; hop < this.config.maxRedirectHops; hop++) {
      const guarded = await this.guard(currentUrl);
      if (!guarded.ok) {
        return { ok: false, rejection: guarded };
      }

      const response = await this.probe(currentUrl);
      if (!REDIRECT_STATUSES.has(response.status)) {
        return { ok: true, response, finalUrl: currentUrl };
      }

      const location = response.headers.get('location');
      if (!location) {
        return {
          ok: false,
          rejection: this.reject(code, `Redirect at ${currentUrl} carried no Location header`),
        };
      }
      currentUrl = new URL(location, currentUrl).toString();
    }

    return {
      ok: false,
      rejection: this.reject(
        code,
        `More than ${this.config.maxRedirectHops} redirects starting at ${rawUrl}`
      ),
    };
  }

  /**
   * Runs on every hop, not just the first.
   *
   * The private-network check comes before the https check on purpose: for something
   * like http://169.254.169.254/ both apply, and "points into a private network" is the
   * finding a publisher needs to see, not "must use https".
   */
  private async guard(candidate: string): Promise<RemoteUrlCheckResult> {
    let url: URL;
    try {
      url = await assertPublicHttpUrl(candidate);
    } catch (error) {
      // Unreachable vs private are different findings for a publisher: a name that does
      // not resolve is not "pointing into a private network", and a private hop is not
      // merely offline. protocol/internal/private still share URL_PRIVATE_NETWORK so the
      // existing rejection set stays stable.
      if (error instanceof UnsafeUrlError) {
        if (error.reason === 'invalid-url' || error.reason === 'dns-unresolvable') {
          return this.reject(
            ReleaseRejectionCode.URL_UNREACHABLE,
            error.reason === 'invalid-url'
              ? `Malformed URL: ${candidate}`
              : `Hostname could not be resolved: ${candidate}`
          );
        }
      }
      return this.reject(
        ReleaseRejectionCode.URL_PRIVATE_NETWORK,
        error instanceof Error ? error.message : String(error)
      );
    }

    if (url.protocol !== 'https:') {
      return this.reject(
        ReleaseRejectionCode.URL_NOT_HTTPS,
        `${candidate} must use https; the plugin runs in a page served over https`
      );
    }

    return { ok: true, finalUrl: candidate };
  }

  /**
   * The only way this service reaches the network, so the guarded dispatcher here covers
   * every redirect hop and the descriptor request without either having to ask for it.
   */
  private probe(url: string): Promise<Response> {
    return fetchWithBackoff(
      url,
      withGuardedDispatcher({
        redirect: 'manual',
        headers: { 'User-Agent': 'owox-data-marts' },
      }),
      this.config.remoteProbeTimeoutMs,
      PROBE_ATTEMPTS
    );
  }

  /** Null when the page may be framed; otherwise a human-readable reason. */
  private checkEmbeddable(response: Response): string | null {
    const xfo = response.headers.get('x-frame-options')?.trim();
    if (xfo) {
      // No X-Frame-Options value permits embedding by an arbitrary third party --
      // even ALLOW-FROM is obsolete and ignored by current browsers.
      return `X-Frame-Options: ${xfo} prevents the plugin from being embedded`;
    }

    const frameAncestors = this.readFrameAncestors(response.headers.get('content-security-policy'));
    if (!frameAncestors) {
      return null;
    }

    const publicOrigin = this.config.publicOrigin;
    const permits = frameAncestors.some(
      source =>
        source === '*' ||
        source === 'https:' ||
        (publicOrigin !== undefined && this.matchesOrigin(source, publicOrigin))
    );

    return permits
      ? null
      : `Content-Security-Policy frame-ancestors ${frameAncestors.join(' ')} does not permit embedding`;
  }

  private readFrameAncestors(csp: string | null): string[] | null {
    if (!csp) {
      return null;
    }

    for (const directive of csp.split(';')) {
      const [name, ...sources] = directive.trim().split(/\s+/);
      if (name?.toLowerCase() === 'frame-ancestors') {
        return sources;
      }
    }

    return null;
  }

  private matchesOrigin(source: string, publicOrigin: string): boolean {
    try {
      return new URL(source).origin === publicOrigin;
    } catch {
      return false;
    }
  }

  /**
   * Publish-time stand-in for the real in-iframe handshake.
   *
   * Verifying the live postMessage bootstrap server-side would need a headless browser;
   * a descriptor is the publisher declaring intent, and a live handshake failure shows
   * up as a plugin-load error rather than as corrupted data.
   */
  private async checkDescriptor(finalUrl: string): Promise<RemoteUrlCheckResult> {
    // Resolved beside the plugin rather than at the host root, so a vendor on shared
    // hosting can serve it without owning the domain apex.
    const base = finalUrl.endsWith('/') ? finalUrl : `${finalUrl}/`;
    const descriptorUrl = new URL(SDK_DESCRIPTOR_PATH, base).toString();

    const walked = await this.walk(descriptorUrl, ReleaseRejectionCode.SDK_HANDSHAKE_FAILED);
    if (!walked.ok) {
      return walked.rejection;
    }

    const response = walked.response;
    if (!response.ok) {
      return this.reject(
        ReleaseRejectionCode.SDK_HANDSHAKE_FAILED,
        `${descriptorUrl} returned HTTP ${response.status}`
      );
    }

    let body: DescriptorBody;
    try {
      body = (await response.json()) as DescriptorBody;
    } catch {
      return this.reject(ReleaseRejectionCode.SDK_HANDSHAKE_FAILED, `${descriptorUrl} is not JSON`);
    }

    if (body?.sdk !== 'owox-plugin-sdk') {
      return this.reject(
        ReleaseRejectionCode.SDK_HANDSHAKE_FAILED,
        `${descriptorUrl} does not identify an OWOX plugin`
      );
    }

    if (
      typeof body.sdkVersion !== 'string' ||
      !this.config.supportedSdkVersions.includes(body.sdkVersion)
    ) {
      return this.reject(
        ReleaseRejectionCode.SDK_HANDSHAKE_FAILED,
        `SDK version ${String(body.sdkVersion)} is not supported by this deployment`
      );
    }

    return { ok: true, finalUrl };
  }

  private reject(code: ReleaseRejectionCode, detail: string): RemoteUrlCheckResult {
    return { ok: false, code, detail };
  }
}
