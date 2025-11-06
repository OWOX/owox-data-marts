import { ApiProperty } from '@nestjs/swagger';

export class ConnectorStateItemResponseApiDto {
  @ApiProperty({ example: '2861dd75-6a3a-434e-86e6-e4757808ac9d' })
  _id: string;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    example: { date: '2024-04-05T00:00:00.000Z' },
  })
  state: Record<string, unknown>;

  @ApiProperty({ example: '2025-10-31 11:39:44' })
  at: string;
}

export class ConnectorStateResponseApiDto {
  @ApiProperty({ required: false, type: Object, additionalProperties: true })
  state?: Record<string, unknown>;

  @ApiProperty({ required: false, example: '2025-10-31T11:39:44.377Z' })
  at?: string;

  @ApiProperty({ required: false, type: ConnectorStateItemResponseApiDto, isArray: true })
  states?: ConnectorStateItemResponseApiDto[];
}
