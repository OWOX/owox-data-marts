import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

/**
 * Request to generate OAuth authorization URL
 * Frontend sends this to initiate OAuth flow
 */
export class GenerateAuthorizationUrlRequestDto {
  @ApiProperty({
    example: 'https://app.owox.com/oauth-callback',
    description: 'Frontend callback URL (must match registered redirect URI in Google Console)',
  })
  @IsNotEmpty()
  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  redirectUri: string;
}
