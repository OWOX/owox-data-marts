import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExchangeOAuthCredentialTargetDto {
  @ApiPropertyOptional({ description: 'Reconnect this Credential instead of creating one.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  id?: string;

  @ApiPropertyOptional({ description: 'Defaults to the account name, else the type name.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  availableForUse?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  availableForMaintenance?: boolean;
}

export class ExchangeOAuthCredentialsDto {
  @ApiProperty({ example: 'AuthType.oauth2' })
  @IsNotEmpty()
  @IsString()
  fieldPath: string;

  @ApiProperty({ example: { accessToken: '1234567890' } })
  @IsNotEmptyObject()
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({ type: ExchangeOAuthCredentialTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExchangeOAuthCredentialTargetDto)
  credential?: ExchangeOAuthCredentialTargetDto;
}
