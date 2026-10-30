import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConnectorFieldOptionsPreviewRequestApiDto {
  @ApiProperty({
    example: 'SheetName',
    maxLength: 128,
    description: 'Configuration field declared with the DYNAMIC_OPTIONS attribute.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  field: string;

  @ApiProperty({
    type: Object,
    description:
      'Connector source configuration. Only the fields listed in optionsDependsOn of the requested field have to be filled.',
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
