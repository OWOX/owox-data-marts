import { Injectable } from '@nestjs/common';
import { McpDestinationSetupTokenService } from '../../services/google-oauth/mcp-destination-setup-token.service';
import { RedirectBackAllowlistService } from '../../services/google-oauth/redirect-back-allowlist.service';
import { PublicOriginService } from '../../../common/config/public-origin.service';

export interface BeginMcpGoogleSheetsSetupRequest {
  projectId: string;
  userId: string;
  title?: string;
  redirectBack?: string;
}

export interface BeginMcpGoogleSheetsSetupResult {
  setupUrl: string;
}

/**
 * Mints a short-lived MCP destination setup link. Opening it takes the user straight
 * into Google's OAuth consent screen without any intermediate OWOX page.
 */
@Injectable()
export class BeginMcpGoogleSheetsSetupService {
  constructor(
    private readonly tokenService: McpDestinationSetupTokenService,
    private readonly redirectBackAllowlist: RedirectBackAllowlistService,
    private readonly publicOriginService: PublicOriginService
  ) {}

  run(request: BeginMcpGoogleSheetsSetupRequest): BeginMcpGoogleSheetsSetupResult {
    const token = this.tokenService.issue({
      projectId: request.projectId,
      userId: request.userId,
      title: request.title,
      redirectBack: this.redirectBackAllowlist.sanitize(request.redirectBack),
    });

    const origin = this.publicOriginService.ensureHttps(this.publicOriginService.getPublicOrigin());
    const url = new URL('/data-destinations/oauth/mcp/google-sheets/start', origin);
    url.searchParams.set('token', token);

    return { setupUrl: url.toString() };
  }
}
