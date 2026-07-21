import { ApiProperty } from '@nestjs/swagger';

/**
 * User projection DTO
 */
export class UserProjectionDto {
  @ApiProperty({ example: '540734f6-8eb1-48a9-bf86-22010d3bddfd' })
  public readonly userId: string;

  @ApiProperty({ type: String, example: 'Ada Lovelace', required: false, nullable: true })
  public readonly fullName?: string | null;

  @ApiProperty({ type: String, example: 'ada@example.com', required: false, nullable: true })
  public readonly email?: string | null;

  @ApiProperty({
    type: String,
    example: 'https://example.com/avatar.png',
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
