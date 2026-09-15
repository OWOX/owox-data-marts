import { ApiProperty } from '@nestjs/swagger';

export class ConnectorFieldOptionResponseApiDto {
  @ApiProperty({ example: 'Sheet1', description: 'Value to store in the configuration' })
  value: string;

  @ApiProperty({ example: 'Sheet1', description: 'Human-readable label' })
  label: string;
}
