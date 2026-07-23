import { ApiProperty } from '@nestjs/swagger';

/**
 * User projection DTO
 */
export class UserProjectionDto {
  @ApiProperty({
    example: '540734f6-8eb1-48a9-bf86-22010d3bddfd',
    description: 'User identifier.',
  })
  public readonly userId: string;

  @ApiProperty({
    type: String,
    example: 'Ada Lovelace',
    description: 'User full name when available.',
    required: false,
    nullable: true,
  })
  public readonly fullName?: string | null;

  @ApiProperty({
    type: String,
    format: 'email',
    example: 'ada@example.com',
    description: 'User email address when available.',
    required: false,
    nullable: true,
  })
  public readonly email?: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    example: 'https://example.com/avatar.png',
    description: 'User avatar URL when available.',
    required: false,
    nullable: true,
  })
  public readonly avatar?: string | null;

  constructor(
    userId: string,
    fullName?: string | null,
    email?: string | null,
    avatar?: string | null
  ) {
    this.userId = userId;
    this.fullName = fullName;
    this.email = email;
    this.avatar = avatar;
  }
}
