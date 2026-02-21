import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Request to exchange authorization code for OAuth tokens
 * Frontend sends this after OAuth callback
 */
export class ExchangeAuthorizationCodeRequestDto {
  @ApiProperty({
    example: '4/0AfJohXk1234567890abcdefghijklmnopqrstuvwxyz',
    description: 'Authorization code from Google OAuth callback',
  })
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9qZWN0SWQiOiJ...',
    description: 'State token from authorization URL (CSRF validation)',
  })
  @IsNotEmpty()
  @IsString()
  state: string;
}
