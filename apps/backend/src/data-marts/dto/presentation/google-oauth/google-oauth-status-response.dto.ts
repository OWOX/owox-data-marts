import { ApiProperty } from '@nestjs/swagger';
import { GoogleOAuthUserDto } from './google-oauth-user.dto';

/**
 * OAuth credential status for a storage or destination
 * Indicates whether OAuth is configured and valid
 */
export class GoogleOAuthStatusResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether OAuth credentials exist and have a valid refresh token',
  })
  isValid: boolean;

  @ApiProperty({
    type: GoogleOAuthUserDto,
    description: 'Google user who authorized the app',
    required: false,
  })
  user?: GoogleOAuthUserDto;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Credential ID (UUID)',
    required: false,
  })
  credentialId?: string;
}
