import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CredentialFetchRequestApiDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  url: string;

  @ApiProperty({ description: 'Fetch-compatible HTTP method.' })
  @IsString()
  @MaxLength(32)
  @Matches(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/)
  method: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ nullable: true, description: 'Request body encoded as base64.' })
  @IsOptional()
  @IsString()
  @MaxLength(1_500_000)
  bodyBase64?: string | null;
}

export class CredentialFetchResponseApiDto {
  @ApiProperty() status: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  headers: Record<string, string>;
  @ApiProperty({ description: 'Provider response body encoded as base64.' })
  bodyBase64: string;
}
