import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SuspendPluginApiDto {
  @ApiProperty({
    description: 'GitHub repository, as a URL or owner/name.',
    example: 'https://github.com/OWOX/example-plugin',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  repository: string;

  @ApiPropertyOptional({
    description: 'Why, for the audit trail. Shown to operators, never to members.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class PluginSuspensionResponseApiDto {
  @ApiProperty() pluginId: string;

  @ApiProperty({
    description:
      'While suspended the plugin cannot be opened, installed or restored. Uninstalling and updating stay available, and publications and installations are untouched.',
  })
  suspended: boolean;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;
}
