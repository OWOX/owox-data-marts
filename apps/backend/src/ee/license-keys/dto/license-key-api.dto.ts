import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { RunKind } from '../../../data-marts/services/project-billing/project-billing';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

export class CreateLicenseKeyRequestDto {
  @ApiProperty({ description: 'Human-readable key name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Public origin of the deployment the key is bound to',
    example: 'https://data-marts.example.com',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, require_tld: false },
    {
      message:
        'Public origin must be a full http or https address, for example https://data-marts.example.com',
    }
  )
  origin: string;
}

export class UpdateLicenseKeyRequestDto {
  @ApiProperty({ description: 'Human-readable key name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class LicenseKeyResponseDto {
  @ApiProperty() licenseKeyId: string;
  @ApiProperty() name: string;
  @ApiProperty() origin: string;
  @ApiProperty() expiresAt: string;
  @ApiProperty({ nullable: true }) revokedAt: string | null;
  @ApiProperty({ nullable: true }) lastUsedAt: string | null;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: UserProjectionDto, nullable: true })
  createdByUser: UserProjectionDto | null;
}

export class CreateLicenseKeyResponseDto extends LicenseKeyResponseDto {
  @ApiProperty({ description: 'Full license key, shown once and never stored' })
  licenseKey: string;
}

export class LicenseConsumptionRequestDto {
  @ApiProperty({ enum: RunKind })
  @IsString()
  @IsNotEmpty()
  kind: RunKind;

  @ApiProperty({ type: Object })
  payload: Record<string, unknown>;
}
