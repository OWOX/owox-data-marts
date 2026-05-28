import { ApiProperty } from '@nestjs/swagger';

export class ExchangeProjectMemberApiKeyResponseApiDto {
  @ApiProperty({ example: 'regular-odm-access-token' })
  accessToken: string;
}
