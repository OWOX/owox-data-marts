import { RoleEnum, type Role } from '@owox/idp-protocol';
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

  @ApiPropertyOptional({ enum: RoleEnum.options, isArray: true })
  roles?: Role[];

  @ApiPropertyOptional({ nullable: true })
  projectTitle?: string;

  @ApiPropertyOptional({ nullable: true })
  authFlow?: string;

  @ApiPropertyOptional({ nullable: true })
  apiKeyId?: string;

  @ApiPropertyOptional({ nullable: true })
  pluginId?: string;

  @ApiPropertyOptional({ nullable: true })
  installationId?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'True when the session is in view-only mode. Mutating API requests are rejected server-side; clients may also suppress analytics.',
  })
  viewOnly?: boolean;
}
