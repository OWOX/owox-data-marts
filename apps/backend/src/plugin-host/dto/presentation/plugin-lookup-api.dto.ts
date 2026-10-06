import { ApiProperty } from '@nestjs/swagger';

export class PluginLookupApiDto {
  @ApiProperty({ description: 'The plugin id in this deployment.' })
  pluginId: string;
}
