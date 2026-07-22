import type { Role } from '@owox/idp-protocol';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthContextResponseApiDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  projectId: string;

  @ApiPropertyOptional({ nullable: true })
  email?: string;

  @ApiPropertyOptional({ nullable: true })
  fullName?: string;

  @ApiPropertyOptional({ nullable: true })
  avatar?: string;

  @ApiPropertyOptional({ enum: ['admin', 'editor', 'viewer'], isArray: true })
  roles?: Role[];

  @ApiPropertyOptional({ nullable: true })
  projectTitle?: string;

  @ApiPropertyOptional({ nullable: true })
  authFlow?: string;

  @ApiPropertyOptional({ nullable: true })
  apiKeyId?: string;
}
