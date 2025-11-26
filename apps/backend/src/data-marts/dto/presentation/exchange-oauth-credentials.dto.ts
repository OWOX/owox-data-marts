import { IsNotEmpty, IsString, IsObject, IsNotEmptyObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExchangeOAuthCredentialsDto {
  @ApiProperty({ example: 'AuthType.oauth2' })
  @IsNotEmpty()
  @IsString()
  fieldPath: string;

  @ApiProperty({ example: { accessToken: '1234567890' } })
  @IsNotEmptyObject()
  @IsObject()
  payload: Record<string, unknown>;
}
