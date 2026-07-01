import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExchangeProjectMemberApiKeyResponseApiDto {
  @ApiProperty({ example: 'regular-odm-access-token' })
  accessToken: string;

  @ApiPropertyOptional({ example: 900 })
  accessTokenExpiresIn?: number;
}
