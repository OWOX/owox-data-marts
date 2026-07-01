import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { InvalidOAuthStateException } from '../../exceptions/google-oauth.exceptions';

const TOKEN_PURPOSE = 'mcp_google_sheets_destination_setup' as const;
const TOKEN_TTL_SECONDS = 300;

export interface McpDestinationSetupTokenPayload {
  purpose: typeof TOKEN_PURPOSE;
  projectId: string;
  userId: string;
  title?: string;
  redirectBack?: string;
}

export type McpDestinationSetupTokenInput = Omit<McpDestinationSetupTokenPayload, 'purpose'>;

/**
 * Issues and verifies short-lived (5 min), single-purpose signed tokens that authorize
 * an MCP-initiated Google Sheets destination setup link. Reuses the existing Google
 * OAuth JWT secret rather than introducing a new one.
 */
@Injectable()
export class McpDestinationSetupTokenService {
  constructor(private readonly googleOAuthConfigService: GoogleOAuthConfigService) {}

  issue(payload: McpDestinationSetupTokenInput): string {
    const fullPayload: McpDestinationSetupTokenPayload = { ...payload, purpose: TOKEN_PURPOSE };
    return jwt.sign(fullPayload, this.googleOAuthConfigService.getJwtSecret(), {
      expiresIn: TOKEN_TTL_SECONDS,
    });
  }

  verify(token: string): McpDestinationSetupTokenPayload {
    try {
      const decoded = jwt.verify(token, this.googleOAuthConfigService.getJwtSecret());
      const payload = decoded as McpDestinationSetupTokenPayload;
      if (payload.purpose !== TOKEN_PURPOSE) {
        throw new Error('Unexpected token purpose');
      }
      return payload;
    } catch (error) {
      throw new InvalidOAuthStateException(error);
    }
  }
}
