import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProjectMemberApiKeyRequestDto {
  @ApiProperty({ description: 'User-facing name for the API key' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Optional expiration date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class UpdateProjectMemberApiKeyRequestDto {
  @ApiProperty({ description: 'New name for the API key' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class ProjectMemberApiKeyResponseDto {
  @ApiProperty()
  apiKeyId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  expiresAt: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ nullable: true })
  lastAuthenticatedAt: string | null;
}

export class CreateProjectMemberApiKeyResponseDto extends ProjectMemberApiKeyResponseDto {
  @ApiProperty({ description: 'Shown only once at creation time' })
  apiKeySecret: string;
}
