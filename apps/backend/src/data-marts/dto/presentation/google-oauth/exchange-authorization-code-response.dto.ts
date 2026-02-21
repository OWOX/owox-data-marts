import { ApiProperty } from '@nestjs/swagger';
import { GoogleOAuthUserDto } from './google-oauth-user.dto';

/**
 * Result of successful OAuth token exchange
 * Contains credential ID and user information
 */
export class ExchangeAuthorizationCodeResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether token exchange was successful',
  })
  success: boolean;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Created credential ID (UUID)',
  })
  credentialId: string;

  @ApiProperty({
    type: GoogleOAuthUserDto,
    description: 'Google user who authorized the app',
    required: false,
  })
  user?: GoogleOAuthUserDto;

  @ApiProperty({
    example: ['Token will expire in 1 hour. Refresh token available for automatic renewal.'],
    description: 'Optional warnings or informational messages',
    type: [String],
    required: false,
  })
  warnings?: string[];
}
