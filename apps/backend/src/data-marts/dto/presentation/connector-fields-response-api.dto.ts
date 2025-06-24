import { ApiProperty } from '@nestjs/swagger';

export class ConnectorFieldResponseApiDto {
  @ApiProperty({ example: 'field_name' })
  name: string;

  @ApiProperty({ example: 'Field Type', required: false })
  type?: string;

  @ApiProperty({ example: 'Field Description', required: false })
  description?: string;
}

export class ConnectorFieldsResponseApiDto {
  @ApiProperty({ example: 'field_name' })
  name: string;

  @ApiProperty({ example: 'Field Overview', required: false })
  overview?: string;

  @ApiProperty({ example: 'Field Description', required: false })
  description?: string;

  @ApiProperty({ example: 'Field Documentation', required: false })
  documentation?: string;

  @ApiProperty({ example: 'Field Fields', required: false })
  fields?: ConnectorFieldResponseApiDto[];
}
