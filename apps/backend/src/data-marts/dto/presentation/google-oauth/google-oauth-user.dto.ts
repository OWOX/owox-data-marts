import { ApiProperty } from '@nestjs/swagger';

/**
 * OAuth user information from Google
 * Returned after successful OAuth authorization
 */
export class GoogleOAuthUserDto {
  @ApiProperty({
    example: '1234567890',
    description: 'Google user ID',
    required: false,
  })
  id?: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'User display name',
    required: false,
  })
  name?: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
    required: false,
  })
  email?: string;

  @ApiProperty({
    example: 'https://lh3.googleusercontent.com/a/default-user',
    description: 'User profile picture URL',
    required: false,
  })
  picture?: string;
}
