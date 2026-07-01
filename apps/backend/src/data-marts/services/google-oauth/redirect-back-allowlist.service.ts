import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALLOWED_SCHEMES = ['claude:', 'cursor:', 'vscode:'];

/**
 * Validates a caller-supplied "redirect back" URL before it is ever used for a real
 * browser redirect (MCP-initiated destination setup flows). Deliberately non-throwing:
 * callers should degrade gracefully (skip the redirect) rather than fail the whole flow
 * when redirect_back is missing, malformed, or not allowlisted.
 */
@Injectable()
export class RedirectBackAllowlistService {
  constructor(private readonly config: ConfigService) {}

  sanitize(raw?: string): string | undefined {
    if (!raw) return undefined;

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return undefined;
    }

    if (ALLOWED_SCHEMES.includes(url.protocol)) {
      return raw;
    }

    if (url.protocol === 'https:' && this.allowedOrigins.includes(url.origin)) {
      return raw;
    }

    return undefined;
  }

  private get allowedOrigins(): string[] {
    const value = this.config.get<string>('MCP_DESTINATION_SETUP_ALLOWED_REDIRECT_ORIGINS') ?? '';
    return value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
}
