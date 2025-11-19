import { ApiProperty } from '@nestjs/swagger';

export class ConnectorOAuthSettingsResponseApiDto {
  @ApiProperty({
    example: { AppId: '718780528197362', Scopes: 'ads_read,business_management' },
    description: 'OAuth UI variables with resolved environment variable templates',
  })
  vars: Record<string, unknown>;
}
