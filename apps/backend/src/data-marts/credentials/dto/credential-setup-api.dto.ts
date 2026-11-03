import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  CredentialSetupDto,
  CredentialSetupStatus,
  StartCredentialSetupInput,
} from './credential-setup.dto';

export class StartCredentialSetupApiDto implements StartCredentialSetupInput {
  @ApiPropertyOptional({
    description: 'Suggested name for a new Credential. The user can change it in the form.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  definitionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  credentialId?: string;
}

export class CompleteCredentialSetupApiDto {
  @ApiProperty()
  @IsUUID()
  credentialId: string;
}

export class CredentialSetupResponseApiDto implements CredentialSetupDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['create', 'update'] }) mode: 'create' | 'update';
  @ApiProperty({ enum: ['pending', 'completed', 'cancelled', 'expired'] })
  status: CredentialSetupStatus;
  @ApiProperty({ type: String, nullable: true }) definitionId: string | null;
  @ApiProperty({ type: String, nullable: true }) credentialId: string | null;
  @ApiProperty({ type: String, nullable: true }) title: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() expiresAt: Date;
  @ApiProperty({ type: Date, nullable: true }) completedAt: Date | null;
}
