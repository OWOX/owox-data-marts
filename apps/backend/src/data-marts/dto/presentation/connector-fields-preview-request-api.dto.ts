import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class ConnectorFieldsPreviewRequestApiDto {
  @ApiProperty({
    type: Object,
    description: 'Connector source configuration used to detect dynamic fields.',
  })
  @IsObject()
  configuration: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Data Mart whose saved configuration is previewed; lets its editors preview with the Credential bound to that configuration.',
  })
  @IsOptional()
  @IsString()
  dataMartId?: string;
}
