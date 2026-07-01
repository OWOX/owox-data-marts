import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Request to finish an MCP-initiated Google Sheets destination setup.
 * Sent by GoogleOAuthCallbackPage when there is no in-app popup session
 * (i.e. the OAuth flow was started from an MCP-generated setup link).
 */
export class FinishMcpGoogleSheetsSetupRequestDto {
  @ApiProperty({
    example: '4/0AfJohXk1234567890abcdefghijklmnopqrstuvwxyz',
    description: 'Authorization code from Google OAuth callback',
  })
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9qZWN0SWQiOiJ...',
    description: 'State token from the authorization URL',
  })
  @IsNotEmpty()
  @IsString()
  state: string;
}
