import { ApiProperty } from '@nestjs/swagger';

/**
 * Google OAuth configuration settings
 * Returned to frontend to initialize OAuth flow.
 * When `available` is false, all other fields are absent.
 */
export class GoogleOAuthSettingsResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether OAuth is configured for this resource type',
  })
  available: boolean;

  @ApiProperty({
    example: 'https://accounts.google.com/o/oauth2/v2/auth',
    description: 'Google OAuth authorization endpoint',
    required: false,
  })
  authorizationEndpoint?: string;

  @ApiProperty({
    example: '123456789-abcdefghijklmnop.apps.googleusercontent.com',
    description: 'OAuth client ID (public, safe to expose to frontend)',
    required: false,
  })
  clientId?: string;

  @ApiProperty({
    example: 'https://app.owox.com/api/google-oauth/callback',
    description: 'OAuth redirect URI configured in Google Console',
    required: false,
  })
  redirectUri?: string;

  @ApiProperty({
    example: ['https://www.googleapis.com/auth/bigquery'],
    description: 'Available OAuth scopes for this resource type',
    type: [String],
    required: false,
  })
  availableScopes?: string[];
}
