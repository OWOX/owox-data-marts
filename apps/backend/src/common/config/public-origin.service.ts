import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_PORT } from '../../config/constants';

/**
 * Service for deriving and validating public origins used by the application.
 *
 * Responsibilities:
 * - Normalize origin strings by adding protocols (http/https) when missing
 * - Validate URL structure (hostname and protocol)
 * - Provide a consistent, safe fallback for public-facing URLs
 */
@Injectable()
export class PublicOriginService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Ensures an HTTPS scheme is present in the provided value.
   *
   * Behavior:
   * - If value has no scheme → adds http:// first, then upgrades to https://
   * - If value already uses https:// → returns as is
   * - If value uses http:// → converts to https://
   *
   * @param value Raw origin or host (may be missing scheme)
   * @returns Origin string with https scheme
   */
  ensureHttps(value: string): string {
    const withHttp = this.ensureHttp(value);
    if (withHttp.startsWith('https://')) return withHttp;
    return `https://${withHttp.slice('http://'.length)}`;
  }

  /**
   * Ensures an HTTP scheme is present in the provided value.
   *
   * Behavior:
   * - If value has no scheme → adds http://
   * - If value already has http:// or https:// → returns as is
   *
   * @param value Raw origin or host (may be missing scheme)
   * @returns Origin string with http or https scheme
   */
  ensureHttp(value: string): string {
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    return `http://${value}`;
  }

  /**
   * Validates a URL string to be a well-formed http/https URL with a hostname.
   *
   * @param value URL string to validate (must already contain a scheme)
   * @returns True if the URL is valid and has http/https scheme, false otherwise
   */
  private isValidUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return Boolean(url.hostname) && (url.protocol === 'http:' || url.protocol === 'https:');
    } catch {
      return false;
    }
  }

  /**
   * Returns a normalized deployment URL for Looker Studio connector.
   *
   * Resolution order:
   * 1) LOOKER_STUDIO_DESTINATION_ORIGIN (normalized to https and validated)
   * 2) PUBLIC_ORIGIN (via getPublicOrigin), then normalized to https
   *
   * @returns HTTPS origin suitable for exposing to Looker Studio
   */
  getLookerStudioDeploymentUrl(): string {
    const lsOrigin = (this.config.get<string>('LOOKER_STUDIO_DESTINATION_ORIGIN') || '').trim();
    const publicOrigin = this.getPublicOrigin();
    if (lsOrigin) {
      const candidateWithHttps = this.ensureHttps(lsOrigin);
      if (this.isValidUrl(candidateWithHttps)) return candidateWithHttps;
    }
    return this.ensureHttps(publicOrigin);
  }

  /**
   * Returns the application's public origin.
   *
   * Behavior:
   * - Reads PUBLIC_ORIGIN, adds http scheme if missing and validates
   * - On empty or invalid PUBLIC_ORIGIN → returns http://localhost:PORT (with PORT fallback to DEFAULT_PORT)
   *
   * @returns Public origin URL string (http)
   */
  getPublicOrigin(): string {
    const rawPort = this.config.get<number | string>('PORT');
    const normalizedPort = Number(rawPort);
    const port =
      Number.isFinite(normalizedPort) && normalizedPort > 0 ? normalizedPort : DEFAULT_PORT;
    const publicOriginRaw = (this.config.get<string>('PUBLIC_ORIGIN') || '').trim();
    if (publicOriginRaw) {
      const withProtocol = this.ensureHttp(publicOriginRaw);
      if (this.isValidUrl(withProtocol)) return withProtocol;
    }
    return `http://localhost:${port}`;
  }
}
