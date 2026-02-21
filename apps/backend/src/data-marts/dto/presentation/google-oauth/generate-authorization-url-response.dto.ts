import { ApiProperty } from '@nestjs/swagger';

/**
 * OAuth authorization URL with state token
 * Frontend redirects user to authorizationUrl
 */
export class GenerateAuthorizationUrlResponseDto {
  @ApiProperty({
    example:
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=123...&redirect_uri=https%3A%2F%2Fapp.owox.com%2Foauth-callback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fbigquery&state=eyJhbGc...',
    description: 'Complete authorization URL (redirect user to this URL)',
  })
  authorizationUrl: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9qZWN0SWQiOiJ...',
    description: 'State token for CSRF protection (validate on OAuth callback)',
  })
  state: string;
}
