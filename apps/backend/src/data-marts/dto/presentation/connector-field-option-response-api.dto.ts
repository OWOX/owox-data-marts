import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectorFieldOptionResponseApiDto {
  @ApiProperty({ example: 'Sheet1', description: 'Value to store in the configuration' })
  value: string;

  @ApiProperty({ example: 'Sheet1', description: 'Human-readable label' })
  label: string;

  @ApiPropertyOptional({
    example: 'https://docs.google.com/spreadsheets/d/1AbC/edit#gid=0',
    description: 'Link that opens this value in the provider, when the source provides one',
  })
  url?: string;
}
