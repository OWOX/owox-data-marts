import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class ConnectorFieldOptionsPreviewRequestApiDto {
  @ApiProperty({
    example: 'SheetName',
    description: 'Configuration field declared with the DYNAMIC_OPTIONS attribute.',
  })
  @IsString()
  @IsNotEmpty()
  field: string;

  @ApiProperty({
    type: Object,
    description:
      'Connector source configuration. Only the fields listed in optionsDependsOn of the requested field have to be filled.',
  })
  @IsObject()
  configuration: Record<string, unknown>;
}
