import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PostConnectorOAuthSettingsDto {
  @ApiProperty({
    example: 'AuthType.oauth2',
    description: 'Path to the OAuth configuration in connector specification',
  })
  @IsNotEmpty()
  @IsString()
  path: string;
}
